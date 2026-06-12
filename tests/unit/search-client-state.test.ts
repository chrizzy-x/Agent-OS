import { describe, expect, it } from 'vitest';
import {
  pushRecentSearch,
  readPinnedResults,
  readRecentSearches,
  togglePinnedResult,
} from '../../src/search/client-state.js';

describe('search client state helpers', () => {
  it('parses recent searches defensively', () => {
    expect(readRecentSearches('["Studio","Memory",""]')).toEqual(['Studio', 'Memory']);
    expect(readRecentSearches('not-json')).toEqual([]);
  });

  it('keeps recent searches unique and capped', () => {
    const recent = Array.from({ length: 8 }, (_, index) => `item-${index}`);
    expect(pushRecentSearch(recent, 'item-3')[0]).toBe('item-3');
    expect(pushRecentSearch(recent, 'new-item')).toHaveLength(8);
  });

  it('parses and toggles pinned results', () => {
    const pin = { id: 'app-1', kind: 'app', title: 'Research Kit', href: '/appstore/research-kit' };
    expect(readPinnedResults(JSON.stringify([pin]))).toEqual([pin]);
    expect(togglePinnedResult([], pin)).toEqual([pin]);
    expect(togglePinnedResult([pin], pin)).toEqual([]);
  });
});
