export type SearchResultPin = {
  id: string;
  kind: string;
  title: string;
  href: string;
};

export const SEARCH_HISTORY_KEY = 'agentos:search:recent';
export const SEARCH_PINNED_KEY = 'agentos:search:pinned';

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readRecentSearches(raw: string | null): string[] {
  const parsed = parseJson<unknown>(raw);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
    : [];
}

export function pushRecentSearch(recent: string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return recent.slice(0, 8);
  return [trimmed, ...recent.filter(item => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
}

export function readPinnedResults(raw: string | null): SearchResultPin[] {
  const parsed = parseJson<unknown>(raw);
  return Array.isArray(parsed)
    ? parsed
        .filter((item): item is SearchResultPin =>
          Boolean(item)
          && typeof item === 'object'
          && typeof (item as SearchResultPin).id === 'string'
          && typeof (item as SearchResultPin).kind === 'string'
          && typeof (item as SearchResultPin).title === 'string'
          && typeof (item as SearchResultPin).href === 'string')
        .slice(0, 12)
    : [];
}

export function togglePinnedResult(pins: SearchResultPin[], next: SearchResultPin): SearchResultPin[] {
  const existing = pins.find(item => item.id === next.id && item.kind === next.kind);
  if (existing) {
    return pins.filter(item => !(item.id === next.id && item.kind === next.kind));
  }
  return [next, ...pins].slice(0, 12);
}
