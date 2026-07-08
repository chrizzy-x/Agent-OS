import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { appendShellContextToHref } from '../../src/product/shell-routing.js';

const onboardingSource = readFileSync('components/pages/OnboardingPage.tsx', 'utf8');
const projectsSource = readFileSync('components/pages/ProjectsPage.tsx', 'utf8');
const appShellSource = readFileSync('components/os/application-shell.tsx', 'utf8');
const docsSource = readFileSync('docs/first-run-onboarding.md', 'utf8');

describe('first-run onboarding', () => {
  it('keeps required first-run actions visible and route-backed', () => {
    expect(onboardingSource).toContain('Start a chat');
    expect(onboardingSource).toContain('Create a project');
    expect(onboardingSource).toContain('Install an app');
    expect(onboardingSource).toContain('Install a skill');
    expect(onboardingSource).toContain('Create a subagent');
    expect(onboardingSource).toContain('Connect a tool');
    expect(onboardingSource).toContain('/projects?create=1');
    expect(onboardingSource).toContain('/appstore');
    expect(onboardingSource).toContain('/skillstore');
    expect(onboardingSource).toContain('/subagents?create=1');
    expect(onboardingSource).toContain('/mcp');
    expect(onboardingSource).not.toContain('<AppShell');
    expect(onboardingSource).not.toContain('<Nav');
  });

  it('keeps enterprise setup gated and distinct from retail workspace usage', () => {
    expect(onboardingSource).toContain('Enterprise Setup');
    expect(onboardingSource).toContain('Open Developer Console');
    expect(onboardingSource).toContain('Set up SDK access');
    expect(onboardingSource).toContain('Create app listing');
    expect(onboardingSource).toContain('Create skill listing');
    expect(onboardingSource).toContain('Enterprise Plus or Enterprise Max');
  });

  it('keeps onboarding inside shell context and lets create project deep-link open the form', () => {
    expect(appShellSource).not.toContain("'/onboarding'");
    expect(appendShellContextToHref('/onboarding', { workspaceId: 'w1', projectId: 'p1', sessionId: 's1' })).toBe('/onboarding?workspace=w1&project=p1');
    expect(projectsSource).toContain('URLSearchParams(window.location.search)');
    expect(projectsSource).toContain("params.get('create') === '1'");
    expect(projectsSource).toContain('setCreating(true)');
  });

  it('documents honest first-run data discipline', () => {
    expect(docsSource).toContain('action board');
    expect(docsSource).toContain('must not show fake installs');
    expect(docsSource).toContain('disabled reason');
  });
});
