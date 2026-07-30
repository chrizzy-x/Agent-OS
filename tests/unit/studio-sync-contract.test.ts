import { describe, expect, it } from 'vitest';
import { buildStudioSyncContract, changedSince, STUDIO_SYNC_CONTRACT_VERSION } from '../../src/studio/sync-contract.js';

describe('Studio sync contract', () => {
  it('versions cross-device Studio resources', () => {
    const contract = buildStudioSyncContract();

    expect(contract.version).toBe(STUDIO_SYNC_CONTRACT_VERSION);
    expect(contract.owner).toBe('super_agentos');
    expect(contract.resources.sessions.includesDeleted).toBe(true);
    expect(contract.resources.intelligenceSelection.nativeAlwaysAvailable).toBe(true);
    expect(contract.resources.tasks.supportsCancellation).toBe(true);
    expect(contract.resources.tasks.supportsRetry).toBe(true);
  });

  it('filters records using stable update cursors', () => {
    const items = [
      { id: 'old', updatedAt: '2026-07-24T10:00:00.000Z' },
      { id: 'new', updatedAt: '2026-07-24T12:00:00.000Z' },
    ];

    expect(changedSince(items, '2026-07-24T11:00:00.000Z', item => item.updatedAt)).toEqual([
      { id: 'new', updatedAt: '2026-07-24T12:00:00.000Z' },
    ]);
  });
});
