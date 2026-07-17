import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_CATALOG } from '../../src/docs/catalog.js';

const contractAddress = '2Fob54QUhUbP9jv6h5XAh3PgB1kcULR6LXbxSzuwpump';
const root = process.cwd();

describe('AgentOS official provenance', () => {
  it('publishes the official sAGENT contract address in README and docs', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const provenance = fs.readFileSync(path.join(root, 'docs', 'provenance.md'), 'utf8');

    expect(readme).toContain(contractAddress);
    expect(provenance).toContain(contractAddress);
    expect(provenance).toContain('https://github.com/chrizzy-x/Agent-OS');
    expect(provenance).toContain('https://www.agentos.services');
  });

  it('registers the provenance docs route in the searchable docs catalog', () => {
    expect(DOCS_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: '/docs/provenance',
          title: 'Official Provenance',
          keywords: expect.arrayContaining(['contract', 'sagent', 'github']),
        }),
      ]),
    );
  });
});
