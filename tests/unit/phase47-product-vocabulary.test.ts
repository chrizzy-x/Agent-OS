import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const vocabulary = readFileSync(join(root, 'docs/product-vocabulary.md'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

describe('phase 47 docs and product vocabulary', () => {
  it('defines the required AgentOS product vocabulary', () => {
    [
      'Super AgentOS is the command layer',
      'SDK apps are product surfaces registered through the AgentOS SDK',
      'Skills are modular capabilities',
      'Subagents are user-created operators',
      'Workflows are reusable execution graphs',
      'Vault is the secure permission layer for secrets',
      'Universal MCP is the external connector layer',
      'Agent Credits are platform compute accounting',
    ].forEach(needle => expect(vocabulary).toContain(needle));
  });

  it('keeps monetization and compute language separate', () => {
    expect(vocabulary).toContain('Apps and skills are monetizable surfaces.');
    expect(vocabulary).toContain('Workflows and subagents are not the monetization layer.');
    expect(vocabulary).toContain('Developer earnings are separate from Agent Credits.');
  });

  it('documents FFP as visible but disabled without live protocol claims', () => {
    expect(vocabulary).toContain('FFP is visible but disabled/coming soon');
    expect(vocabulary).toContain('must not claim live FFP validators');
    expect(readme).toContain('PATCH /api/ffp/temp` returns `405 Method Not Allowed');
    expect(readme).toContain('no live validator dashboard, proof events, transactions, voting, or consensus engine ships in this build');
  });
});
