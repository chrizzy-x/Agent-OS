import { ValidationError } from '../../utils/errors.js';
import type { XPostRecord, XUserProfile } from './types.js';

const X_API_BASE_URL = 'https://api.x.com/2';
const X_USER_AGENT = 'AgentOS/1.0 (+https://agentos-app.vercel.app)';

function summarizeXApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unknown X API error';
  }

  const record = payload as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  if (errors.length > 0 && typeof errors[0] === 'object' && errors[0] !== null) {
    const first = errors[0] as Record<string, unknown>;
    return String(first.detail ?? first.message ?? first.title ?? 'Unknown X API error');
  }

  return String(record.detail ?? record.title ?? record.error ?? 'Unknown X API error');
}

async function callXApi<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${X_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': X_USER_AGENT,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ValidationError(`X API request failed: ${summarizeXApiError(payload)}`);
  }

  return payload as T;
}

export async function getCurrentXUser(accessToken: string): Promise<XUserProfile> {
  const payload = await callXApi<{ data?: { id: string; username: string; name: string } }>(
    accessToken,
    '/users/me?user.fields=profile_image_url'
  );

  if (!payload.data?.id || !payload.data.username) {
    throw new ValidationError('X API did not return the authenticated user');
  }

  return {
    id: payload.data.id,
    username: payload.data.username,
    name: payload.data.name,
  };
}

export async function fetchXMentions(accessToken: string, userId: string, limit = 10): Promise<XPostRecord[]> {
  const maxResults = Math.max(5, Math.min(limit, 100));
  const params = new URLSearchParams({
    max_results: String(maxResults),
    expansions: 'author_id',
    'tweet.fields': 'author_id,conversation_id,created_at,public_metrics,referenced_tweets',
    'user.fields': 'username,name',
  });

  const payload = await callXApi<{ data?: Array<Record<string, unknown>> }>(
    accessToken,
    `/users/${encodeURIComponent(userId)}/mentions?${params.toString()}`
  );

  return (payload.data ?? []).map(post => ({
    id: String(post.id ?? ''),
    text: String(post.text ?? ''),
    authorId: typeof post.author_id === 'string' ? post.author_id : undefined,
    createdAt: typeof post.created_at === 'string' ? post.created_at : undefined,
    conversationId: typeof post.conversation_id === 'string' ? post.conversation_id : undefined,
    publicMetrics: typeof post.public_metrics === 'object' && post.public_metrics !== null
      ? (post.public_metrics as Record<string, number>)
      : undefined,
  })).filter(post => post.id && post.text);
}

export async function createXPost(accessToken: string, input: {
  text: string;
  replyToPostId?: string;
}): Promise<{ id: string; text: string }> {
  const payload = await callXApi<{ data?: { id: string; text: string } }>(accessToken, '/tweets', {
    method: 'POST',
    body: JSON.stringify({
      text: input.text,
      ...(input.replyToPostId ? { reply: { in_reply_to_tweet_id: input.replyToPostId } } : {}),
    }),
  });

  if (!payload.data?.id) {
    throw new ValidationError('X API did not return a post ID');
  }

  return {
    id: payload.data.id,
    text: payload.data.text ?? input.text,
  };
}

export async function fetchXUserPosts(accessToken: string, userId: string, limit = 10): Promise<XPostRecord[]> {
  const maxResults = Math.max(5, Math.min(limit, 100));
  const params = new URLSearchParams({
    max_results: String(maxResults),
    'tweet.fields': 'created_at,public_metrics,organic_metrics,non_public_metrics',
  });

  const payload = await callXApi<{ data?: Array<Record<string, unknown>> }>(
    accessToken,
    `/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`
  );

  return (payload.data ?? []).map(post => ({
    id: String(post.id ?? ''),
    text: String(post.text ?? ''),
    createdAt: typeof post.created_at === 'string' ? post.created_at : undefined,
    publicMetrics: typeof post.public_metrics === 'object' && post.public_metrics !== null
      ? (post.public_metrics as Record<string, number>)
      : undefined,
    organicMetrics: typeof post.organic_metrics === 'object' && post.organic_metrics !== null
      ? (post.organic_metrics as Record<string, number>)
      : undefined,
    nonPublicMetrics: typeof post.non_public_metrics === 'object' && post.non_public_metrics !== null
      ? (post.non_public_metrics as Record<string, number>)
      : undefined,
  })).filter(post => post.id);
}