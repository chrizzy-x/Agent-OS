import type { AgentContext } from '../auth/permissions.js';
import { netHttpGet } from '../primitives/net.js';

type SourceResponse = {
  status: number;
  body: string;
  contentType?: string;
};

export type NativeResearchFetcher = (url: string) => Promise<SourceResponse>;

type SearchPage = {
  id?: number;
  key?: string;
  title?: string;
  excerpt?: string;
  description?: string;
};

type ResearchSource = {
  title: string;
  url: string;
  description: string | null;
  timestamp: string | null;
};

export type NativeResearchResult = {
  text: string;
  sources: ResearchSource[];
};

const DATE_PATTERN = /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b|\b20\d{2}\b/i;
const RISK_PATTERN = /\b(nuclear|missile|drone|escalat|blockade|oil|gas|regional|bases?|civilian|sanction|ceasefire|shipping|proxy|retaliat)\b/i;
const ACTORS = [
  'Iran',
  'United States',
  'Israel',
  'Ali Khamenei',
  'Iranian units',
  'US-aligned Arab countries',
  'Houthis',
  'Hezbollah',
  'Hamas',
  'IAEA',
  'Russia',
  'China',
  'European Union',
];

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanQuery(message: string): string {
  const normalized = message
    .replace(/^(research|investigate|look up|find sources for|survey)\s+/i, '')
    .replace(/\b(give me|with timeline|timeline|key actors|current status|risks|what remains uncertain).*/i, '')
    .replace(/[.?!]+$/g, '')
    .trim();
  return normalized || message.trim();
}

function sentences(value: string): string[] {
  return value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function firstSentences(value: string, count: number): string[] {
  return sentences(value).slice(0, count);
}

async function defaultFetcher(ctx: AgentContext, url: string): Promise<SourceResponse> {
  return netHttpGet(ctx, {
    url,
    headers: {
      accept: 'application/json',
    },
  }) as Promise<SourceResponse>;
}

async function fetchJson<T>(fetcher: NativeResearchFetcher, url: string): Promise<T | null> {
  const response = await fetcher(url);
  if (response.status < 200 || response.status >= 300) return null;
  try {
    return JSON.parse(response.body) as T;
  } catch {
    return null;
  }
}

function pickSearchPage(value: unknown): SearchPage | null {
  if (!value || typeof value !== 'object') return null;
  const pages = (value as { pages?: unknown }).pages;
  if (Array.isArray(pages)) {
    return pages.find(page => page && typeof page === 'object') as SearchPage | null ?? null;
  }
  const query = (value as { query?: { search?: unknown } }).query;
  if (Array.isArray(query?.search)) {
    const page = query.search.find(item => item && typeof item === 'object') as SearchPage | undefined;
    return page ? { ...page, key: page.title?.replace(/\s+/g, '_') } : null;
  }
  return null;
}

function extractPageText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const pages = (value as { query?: { pages?: Record<string, { extract?: unknown }> } }).query?.pages;
  if (!pages) return '';
  const page = Object.values(pages).find(item => typeof item.extract === 'string');
  return typeof page?.extract === 'string' ? page.extract : '';
}

function extractSummary(value: unknown): { extract: string; description: string | null; timestamp: string | null; url: string | null } {
  if (!value || typeof value !== 'object') return { extract: '', description: null, timestamp: null, url: null };
  const payload = value as {
    extract?: unknown;
    description?: unknown;
    timestamp?: unknown;
    content_urls?: { desktop?: { page?: unknown } };
  };
  return {
    extract: typeof payload.extract === 'string' ? payload.extract : '',
    description: typeof payload.description === 'string' ? payload.description : null,
    timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : null,
    url: typeof payload.content_urls?.desktop?.page === 'string' ? payload.content_urls.desktop.page : null,
  };
}

function buildResearchBrief(params: {
  query: string;
  title: string;
  summary: string;
  description: string | null;
  timestamp: string | null;
  pageUrl: string;
  extract: string;
  searchPages: SearchPage[];
}): NativeResearchResult {
  const sourceText = [params.summary, params.extract].filter(Boolean).join(' ');
  const sourceSentences = sentences(sourceText);
  const overview = firstSentences(params.summary || params.extract, 3);
  const timeline = unique(sourceSentences.filter(sentence => DATE_PATTERN.test(sentence)).slice(0, 6));
  const risks = unique(sourceSentences.filter(sentence => RISK_PATTERN.test(sentence)).slice(0, 5));
  const actors = ACTORS.filter(actor => new RegExp(`\\b${actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sourceText));
  const related = params.searchPages
    .slice(1, 5)
    .map(page => `${page.title ?? 'Untitled'}${page.description ? ` - ${stripHtml(page.description)}` : ''}`);

  return {
    sources: [{
      title: params.title,
      url: params.pageUrl,
      description: params.description,
      timestamp: params.timestamp,
    }],
    text: [
      `Native research brief: ${params.title}`,
      '',
      `Query: ${params.query}`,
      '',
      'Current status:',
      ...(overview.length ? overview.map(item => `- ${item}`) : ['- The retrieved public source did not provide a concise current-status paragraph.']),
      '',
      'Timeline:',
      ...(timeline.length ? timeline.map(item => `- ${item}`) : ['- No dated timeline statements were available in the retrieved extract.']),
      '',
      'Key actors:',
      actors.length ? `- ${actors.join(', ')}` : '- No key actors were confidently extracted from the retrieved source.',
      '',
      'Risks:',
      ...(risks.length ? risks.map(item => `- ${item}`) : ['- The retrieved extract did not include enough risk detail for a sourced risk assessment.']),
      '',
      'What remains uncertain:',
      '- This is a native source-backed brief from public web retrieval, not connected external intelligence.',
      '- The situation can change quickly; verify battlefield claims, casualty figures, and diplomatic statements against primary or current reporting before acting on them.',
      '',
      'Sources:',
      `- ${params.title}: ${params.pageUrl}${params.timestamp ? ` (retrieved page timestamp ${params.timestamp})` : ''}`,
      ...(related.length ? ['', 'Related public search results:', ...related.map(item => `- ${item}`)] : []),
    ].join('\n'),
  };
}

export async function runNativeResearch(params: {
  message: string;
  agentContext: AgentContext;
  fetcher?: NativeResearchFetcher;
}): Promise<NativeResearchResult> {
  const query = cleanQuery(params.message);
  const fetcher = params.fetcher ?? ((url: string) => defaultFetcher(params.agentContext, url));
  const searchUrl = `https://api.wikimedia.org/core/v1/wikipedia/en/search/page?q=${encodeURIComponent(query)}&limit=6`;
  let searchPayload = await fetchJson<{ pages?: SearchPage[] }>(fetcher, searchUrl);
  let searchPages = Array.isArray(searchPayload?.pages) ? searchPayload.pages : [];

  if (searchPages.length === 0) {
    const fallbackSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const fallbackSearch = await fetchJson<Record<string, unknown>>(fetcher, fallbackSearchUrl);
    const page = pickSearchPage(fallbackSearch);
    searchPages = page ? [page] : [];
  }

  const page = searchPages.find(item => typeof item.title === 'string' && item.title.trim()) ?? pickSearchPage(searchPayload);
  if (!page?.title) {
    return {
      sources: [],
      text: [
        `Native research brief: ${query}`,
        '',
        'Super AgentOS could not retrieve a public source for this research request through the guarded native network operation.',
      ].join('\n'),
    };
  }

  const pageKey = page.key || page.title.replace(/\s+/g, '_');
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageKey)}`;
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(page.title)}&format=json&origin=*`;
  const [summaryPayload, extractPayload] = await Promise.all([
    fetchJson<Record<string, unknown>>(fetcher, summaryUrl),
    fetchJson<Record<string, unknown>>(fetcher, extractUrl),
  ]);
  const summary = extractSummary(summaryPayload);
  const extract = extractPageText(extractPayload);
  const pageUrl = summary.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(pageKey)}`;

  return buildResearchBrief({
    query,
    title: page.title,
    summary: summary.extract || stripHtml(page.excerpt ?? ''),
    description: summary.description ?? page.description ?? null,
    timestamp: summary.timestamp,
    pageUrl,
    extract,
    searchPages,
  });
}
