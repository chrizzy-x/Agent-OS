import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 40 FFP disabled surface', () => {
  it('keeps the public FFP page visible but explicitly disabled', () => {
    const page = source('components/pages/FfpPage.tsx');

    expect(page).toContain('FFP Disabled / Coming Soon');
    expect(page).toContain('No active protocol routing');
    expect(page).toContain('proof events');
    expect(page).toContain('transactions');
    expect(page).toContain('No active protocol');
    expect(page).not.toContain('validator dashboard');
  });

  it('marks compatibility route data as disabled and avoids active validator counters', () => {
    const listRoute = source('app/api/ffp/routes/route.ts');
    const detailRoute = source('app/api/ffp/routes/[id]/route.ts');

    for (const route of [listRoute, detailRoute]) {
      expect(route).toContain("protocolState: 'disabled'");
      expect(route).toContain('consensusAvailable: false');
      expect(route).toContain("displayStatus: 'Compatibility record only'");
      expect(route).toContain('consensusThreshold: null');
      expect(route).toContain('validatorCount: null');
    }
  });

  it('documents FFP as future protocol work without overclaiming', () => {
    const docs = source('docs/ffp.md');

    expect(docs).toContain('No active FFP protocol routing.');
    expect(docs).toContain('No validator dashboard.');
    expect(docs).toContain('No proof events.');
    expect(docs).toContain('No transactions.');
    expect(docs).toContain('No consensus engine.');
    expect(docs).toContain('No decentralization claim.');
  });
});
