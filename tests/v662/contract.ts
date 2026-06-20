import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { expect } from 'vitest';
import { APP_VERSION } from '../../src/config/release.js';
import { normalizeExecutionStatus, normalizeExecutionType, type ExecutionStatus, type ExecutionType } from '../../src/execution/service.js';
import { shouldUseFfpTemp, type FfpTempSettings } from '../../src/ffp/temp.js';

export const EXECUTION_TYPES: ExecutionType[] = [
  'CHAT_EXECUTION',
  'WORKFLOW_EXECUTION',
  'APP_EXECUTION',
  'SKILL_EXECUTION',
  'SUBAGENT_EXECUTION',
  'MCP_EXECUTION',
  'FILE_EXECUTION',
  'MEMORY_EXECUTION',
  'EXTERNAL_CONNECTION_EXECUTION',
];

export const EXECUTION_STATUSES: ExecutionStatus[] = [
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

export const REQUIRED_SPEC_NAMES = [
  'super-agentos-basic-chat.spec.ts',
  'chat-persistence.spec.ts',
  'auth-logout.spec.ts',
  'profile-billing-upgrade.spec.ts',
  'workspace-ownership.spec.ts',
  'project-context.spec.ts',
  'studio-mode-switching.spec.ts',
  'library-assets.spec.ts',
  'appstore-lifecycle.spec.ts',
  'app-workspace-install.spec.ts',
  'app-offline-device-install.spec.ts',
  'skill-lifecycle.spec.ts',
  'workflow-lifecycle.spec.ts',
  'workflow-true-resume.spec.ts',
  'workflow-discovery.spec.ts',
  'subagent-lifecycle.spec.ts',
  'mcp-lifecycle.spec.ts',
  'external-connection-token.spec.ts',
  'bearer-token-management.spec.ts',
  'vault-secret-safety.spec.ts',
  'ffp-temp-routing.spec.ts',
  'file-lifecycle.spec.ts',
  'memory-scope.spec.ts',
  'recovery-center.spec.ts',
  'panic-button.spec.ts',
  'global-search.spec.ts',
  'notifications-deeplink.spec.ts',
  'mobile-parity.spec.ts',
];

export function readRepoFile(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

export function expectRoute(...parts: string[]): void {
  expect(existsSync(join(process.cwd(), ...parts))).toBe(true);
}

export function expectMigrationContains(...needles: string[]): void {
  const sql = readRepoFile('src', 'storage', 'migrations', '029_v662_execution_closure.sql');
  for (const needle of needles) expect(sql).toContain(needle);
}

export function expectSourceContains(parts: string[], ...needles: string[]): void {
  const source = readRepoFile(...parts);
  for (const needle of needles) expect(source).toContain(needle);
}

export function expectCanonicalExecutionContract(): void {
  expect(APP_VERSION).toBe('6.6.4');
  expect(EXECUTION_TYPES.map(type => normalizeExecutionType(type))).toEqual(EXECUTION_TYPES);
  expect(EXECUTION_STATUSES.map(status => normalizeExecutionStatus(status))).toEqual(EXECUTION_STATUSES);
  expect(normalizeExecutionStatus('waiting_for_user')).toBe('PAUSED');
  expect(normalizeExecutionStatus('partially_completed')).toBe('FAILED');
}

export function expectFfpTempRouting(): void {
  const enabled: FfpTempSettings = {
    workspaceId: 'workspace-1',
    enabled: true,
    status: 'FFP Enabled',
    route: 'Multi-agent activities -> FFP temporary abstraction layer -> Unified Execution Engine',
    affectedExecutionTypes: ['multi-agent workflows'],
    bypassedExecutionTypes: ['single-agent chat'],
    updatedAt: null,
  };
  const disabled = { ...enabled, enabled: false, status: 'FFP Disabled' as const };
  expect(shouldUseFfpTemp(enabled, 'multi_agent_workflow')).toBe(false);
  expect(shouldUseFfpTemp(enabled, 'subagent_collaboration')).toBe(false);
  expect(shouldUseFfpTemp(enabled, 'single_agent_chat')).toBe(false);
  expect(shouldUseFfpTemp(disabled, 'multi_agent_workflow')).toBe(false);
}
