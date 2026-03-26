import { describe, expect, it } from 'vitest';
import { coerceXAccountPolicy, evaluateXDraftGuardrails } from '../../../src/integrations/x/guardrails.js';

describe('X guardrails', () => {
  it('requires approval for posts by default', () => {
    const policy = coerceXAccountPolicy({});
    const result = evaluateXDraftGuardrails({
      text: 'Ship the new feature this afternoon.',
      kind: 'post',
      policy,
      ownRecentDraftTexts: [],
      crossAccountRecentTexts: [],
      postsPublishedToday: 0,
      repliesPublishedToday: 0,
    });

    expect(result.status).toBe('needs_review');
    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('rejects near-duplicate content across managed accounts', () => {
    const policy = coerceXAccountPolicy({
      approval_required_for_posts: false,
    });

    const result = evaluateXDraftGuardrails({
      text: 'Launching our AI analytics dashboard today for growth teams.',
      kind: 'post',
      policy,
      ownRecentDraftTexts: [],
      crossAccountRecentTexts: ['Launching our AI analytics dashboard today for growth teams'],
      postsPublishedToday: 0,
      repliesPublishedToday: 0,
    });

    expect(result.status).toBe('rejected');
    expect(result.reasons.some(reason => reason.includes('another managed account'))).toBe(true);
  });
});