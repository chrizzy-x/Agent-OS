import { describe, expect, it } from 'vitest';
import { appendShellContextToHref } from '../../src/product/shell-routing.js';

const context = { workspaceId: 'workspace-1', projectId: 'project-1', sessionId: 'session-1' };

describe('shell routing helpers', () => {
  it('preserves workspace and project context for workspace surfaces', () => {
    expect(appendShellContextToHref('/library', context)).toBe('/library?workspace=workspace-1&project=project-1');
  });

  it('preserves session context only when returning to Studio', () => {
    expect(appendShellContextToHref('/studio?mode=workflow', context)).toBe('/studio?mode=workflow&workspace=workspace-1&project=project-1&session=session-1');
    expect(appendShellContextToHref('/projects', context)).not.toContain('session=');
  });

  it('does not overwrite explicit route context', () => {
    expect(appendShellContextToHref('/studio?workspace=w2&project=p2&session=s2&mode=code', context)).toBe('/studio?workspace=w2&project=p2&session=s2&mode=code');
  });

  it('keeps auth routes and external hrefs unchanged', () => {
    expect(appendShellContextToHref('/signin', context)).toBe('/signin');
    expect(appendShellContextToHref('https://example.com', context)).toBe('https://example.com');
  });
});
