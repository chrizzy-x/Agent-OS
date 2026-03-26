import type { XAccountPolicy, XDraftGuardrailResult, XDraftKind } from './types.js';

const SAME_ACCOUNT_SIMILARITY_THRESHOLD = 0.92;
const CROSS_ACCOUNT_SIMILARITY_THRESHOLD = 0.88;

const defaultPolicy: XAccountPolicy = {
  postingEnabled: true,
  approvalRequiredForPosts: true,
  approvalRequiredForReplies: true,
  maxPostsPerDay: 4,
  maxRepliesPerDay: 10,
  allowedHours: [],
  blockedTopics: [],
  toneProfile: {},
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#][\w_]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter(token => token.length > 1));
}

function calculateSimilarity(left: string, right: string): number {
  const leftTokens = toTokenSet(left);
  const rightTokens = toTokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return normalizeText(left) === normalizeText(right) ? 1 : 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  const denominator = Math.max(leftTokens.size, rightTokens.size);
  return denominator === 0 ? 0 : overlap / denominator;
}

function parseHourList(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => Number.parseInt(String(value), 10))
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 23);
}

function parseStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(value => String(value).trim().toLowerCase()).filter(Boolean);
}

export function coerceXAccountPolicy(raw: unknown): XAccountPolicy {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};

  const toneProfile = source.tone_profile && typeof source.tone_profile === 'object'
    ? source.tone_profile as Record<string, unknown>
    : source.toneProfile && typeof source.toneProfile === 'object'
      ? source.toneProfile as Record<string, unknown>
      : defaultPolicy.toneProfile;

  return {
    postingEnabled: source.posting_enabled === undefined ? defaultPolicy.postingEnabled : Boolean(source.posting_enabled),
    approvalRequiredForPosts: source.approval_required_for_posts === undefined
      ? defaultPolicy.approvalRequiredForPosts
      : Boolean(source.approval_required_for_posts),
    approvalRequiredForReplies: source.approval_required_for_replies === undefined
      ? defaultPolicy.approvalRequiredForReplies
      : Boolean(source.approval_required_for_replies),
    maxPostsPerDay: Number.isFinite(Number(source.max_posts_per_day)) ? Number(source.max_posts_per_day) : defaultPolicy.maxPostsPerDay,
    maxRepliesPerDay: Number.isFinite(Number(source.max_replies_per_day)) ? Number(source.max_replies_per_day) : defaultPolicy.maxRepliesPerDay,
    allowedHours: parseHourList(source.allowed_hours ?? source.allowedHours),
    blockedTopics: parseStringList(source.blocked_topics ?? source.blockedTopics),
    toneProfile,
  };
}

export function evaluateXDraftGuardrails(params: {
  text: string;
  kind: XDraftKind;
  scheduledFor?: Date;
  policy: XAccountPolicy;
  ownRecentDraftTexts: string[];
  crossAccountRecentTexts: string[];
  postsPublishedToday: number;
  repliesPublishedToday: number;
}): XDraftGuardrailResult {
  const reasons: string[] = [];
  const normalizedText = normalizeText(params.text);
  let highestSimilarity = 0;

  if (!params.policy.postingEnabled) {
    reasons.push('Posting is disabled for this X account.');
  }

  for (const blockedTopic of params.policy.blockedTopics) {
    if (normalizedText.includes(blockedTopic)) {
      reasons.push(`Draft matched blocked topic '${blockedTopic}'.`);
      break;
    }
  }

  for (const candidate of params.ownRecentDraftTexts) {
    const similarity = calculateSimilarity(params.text, candidate);
    highestSimilarity = Math.max(highestSimilarity, similarity);
    if (similarity >= SAME_ACCOUNT_SIMILARITY_THRESHOLD) {
      reasons.push('Draft is too similar to a recent post or queued item on the same account.');
      break;
    }
  }

  for (const candidate of params.crossAccountRecentTexts) {
    const similarity = calculateSimilarity(params.text, candidate);
    highestSimilarity = Math.max(highestSimilarity, similarity);
    if (similarity >= CROSS_ACCOUNT_SIMILARITY_THRESHOLD) {
      reasons.push('Draft is too similar to content already planned on another managed account.');
      break;
    }
  }

  if (params.policy.allowedHours.length > 0 && params.scheduledFor) {
    const publishHour = params.scheduledFor.getUTCHours();
    if (!params.policy.allowedHours.includes(publishHour)) {
      reasons.push(`Scheduled time falls outside the allowed publish hours (${params.policy.allowedHours.join(', ')} UTC).`);
    }
  }

  if (params.kind === 'post' && params.postsPublishedToday >= params.policy.maxPostsPerDay) {
    reasons.push('Daily post cap has already been reached for this account.');
  }

  if (params.kind === 'reply' && params.repliesPublishedToday >= params.policy.maxRepliesPerDay) {
    reasons.push('Daily reply cap has already been reached for this account.');
  }

  const requiresApproval = params.kind === 'reply'
    ? params.policy.approvalRequiredForReplies
    : params.policy.approvalRequiredForPosts;

  if (reasons.length > 0) {
    return {
      status: 'rejected',
      requiresApproval: true,
      reasons,
      similarityScore: highestSimilarity,
    };
  }

  return {
    status: requiresApproval ? 'needs_review' : 'approved',
    requiresApproval,
    reasons: [],
    similarityScore: highestSimilarity,
  };
}