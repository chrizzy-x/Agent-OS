export type XConnectionStatus = 'active' | 'disabled' | 'revoked';
export type XDraftKind = 'post' | 'reply';
export type XGuardrailStatus = 'approved' | 'needs_review' | 'rejected';
export type XApprovalStatus = 'required' | 'approved' | 'blocked' | 'auto_approved';
export type XPublishStatus = 'queued' | 'publishing' | 'published' | 'failed' | 'canceled';

export interface XAccountConnectionRow {
  id: string;
  owner_agent_id: string;
  child_agent_id: string;
  x_user_id: string;
  username: string;
  display_name: string | null;
  scopes: string[] | null;
  encrypted_refresh_token: string;
  encrypted_access_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  status: XConnectionStatus;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface XAccountPolicy {
  postingEnabled: boolean;
  approvalRequiredForPosts: boolean;
  approvalRequiredForReplies: boolean;
  maxPostsPerDay: number;
  maxRepliesPerDay: number;
  allowedHours: number[];
  blockedTopics: string[];
  toneProfile: Record<string, unknown>;
}

export interface XDraftGuardrailResult {
  status: XGuardrailStatus;
  requiresApproval: boolean;
  reasons: string[];
  similarityScore: number;
}

export interface XUserProfile {
  id: string;
  username: string;
  name: string;
}

export interface XPostRecord {
  id: string;
  text: string;
  authorId?: string;
  createdAt?: string;
  conversationId?: string;
  publicMetrics?: Record<string, number>;
  organicMetrics?: Record<string, number>;
  nonPublicMetrics?: Record<string, number>;
}

export interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}