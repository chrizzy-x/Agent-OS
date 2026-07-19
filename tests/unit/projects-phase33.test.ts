import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const detailSource = readFileSync('components/pages/ProjectDetailPage.tsx', 'utf8');
const docsSource = readFileSync('docs/projects.md', 'utf8');

describe('phase 33 projects surface', () => {
  it('exposes project context, editing, archive, delete, and project search controls', () => {
    expect(detailSource).toContain('shell.syncContext');
    expect(detailSource).toContain('Search Project');
    expect(detailSource).toContain('Edit details');
    expect(detailSource).toContain('Archive');
    expect(detailSource).toContain('Restore');
    expect(detailSource).toContain('Delete project');
    expect(detailSource).toContain('ConfirmationDialog');
  });

  it('keeps unsupported assignment honest instead of pretending project assignment exists', () => {
    expect(detailSource).toContain('Direct project asset assignment needs a dedicated assignment API');
    expect(docsSource).toContain('Projects do not show fake activity');
    expect(docsSource).toContain('Opening a project detail page syncs the active workspace and project context');
  });
});
