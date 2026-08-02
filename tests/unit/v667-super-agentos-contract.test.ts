import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/config/release.js';
import { evaluateConfirmationPolicy } from '../../src/confirmations/service.js';
import { normalizeTaskStatus } from '../../src/tasks/service.js';

function exists(...parts: string[]): boolean {
  return existsSync(join(process.cwd(), ...parts));
}

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('v6.6.8 Super AgentOS contract', () => {
  it('publishes the V6.6.8 version label', () => {
    expect(APP_VERSION).toBe('6.6.8');
    expect(read('package.json')).toContain('"version": "6.6.8"');
    expect(read('package-lock.json')).toContain('"version": "6.6.8"');
    expect(read('README.md')).toContain('> V6.6.8');
    expect(exists('RELEASE_NOTES_v6.6.8.md')).toBe(true);
  });

  it('ships context, capability, task, confirmation, memory, notification, library, and super-agent routes', () => {
    expect(exists('app', 'api', 'workspace', 'context', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'capabilities', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'capabilities', 'register', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'capabilities', '[id]', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'capabilities', '[id]', 'actions', '[actionId]', 'execute', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'tasks', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'tasks', '[id]', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'confirmations', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'confirmations', '[id]', 'approve', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'confirmations', '[id]', 'reject', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'memory', '[id]', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'notifications', '[id]', 'read', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'notifications', 'read-all', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'library', 'install', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'library', '[id]', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'super-agent', 'message', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'super-agent', 'sessions', 'route.ts')).toBe(true);
    expect(exists('app', 'api', 'super-agent', 'sessions', '[id]', 'route.ts')).toBe(true);
    expect(exists('app', 'tasks', 'page.tsx')).toBe(true);
  });

  it('adds additive database support for V6.6.8 runtime contract state', () => {
    const migration = read('src', 'storage', 'migrations', '033_v667_super_agentos.sql');
    const v668Migration = read('src', 'storage', 'migrations', '034_v668_runtime_contract.sql');
    const capabilityService = read('src', 'capabilities', 'service.ts');
    const taskService = read('src', 'tasks', 'service.ts');
    expect(migration).toContain('capability_registry');
    expect(migration).toContain('agent_tasks');
    expect(migration).toContain('agent_task_steps');
    expect(migration).toContain('agent_confirmations');
    expect(migration).toContain('super_agent_audit_logs');
    expect(migration).toContain('source_type TEXT');
    expect(migration).toContain('sdk_manifest');
    expect(v668Migration).toContain('health_status');
    expect(v668Migration).toContain('dependencies JSONB');
    expect(v668Migration).toContain('root_execution_id');
    expect(v668Migration).toContain('context_version');
    expect(v668Migration).toContain('waiting_for_approval');
    expect(read('src', 'audit', 'super-agent.ts')).toContain('super_agent_audit_logs');
    expect(capabilityService).toContain('logSuperAgentAudit');
    expect(capabilityService).toContain('CapabilityContract');
    expect(capabilityService).toContain('registryAssets');
    expect(capabilityService).toContain('graphVersion');
    expect(taskService).toContain('rootExecutionId');
    expect(taskService).toContain('contextVersion');
  });

  it('requires approval for write, high-risk, and critical actions', () => {
    expect(evaluateConfirmationPolicy({ actionName: 'search files' }).confirmationRequired).toBe(false);
    expect(evaluateConfirmationPolicy({ actionName: 'create workflow' }).confirmationRequired).toBe(true);
    expect(evaluateConfirmationPolicy({ actionName: 'Use Derek to execute a trade', riskLevel: 'critical' })).toMatchObject({
      confirmationRequired: true,
      requiredApprovals: 2,
    });
    expect(normalizeTaskStatus('awaiting_confirmation')).toBe('awaiting_confirmation');
    expect(normalizeTaskStatus('waitingforapproval')).toBe('waiting_for_approval');
    expect(normalizeTaskStatus('retrying')).toBe('retrying');
    expect(normalizeTaskStatus('archived')).toBe('archived');
    expect(normalizeTaskStatus('unknown')).toBe('queued');
  });

  it('keeps Vault metadata out of model context by contract', () => {
    const contextService = read('src', 'workspace-context', 'service.ts');
    expect(contextService).toContain('contextVersion');
    expect(contextService).toContain('contextObjects');
    expect(contextService).toContain('dependencyHash');
    expect(contextService).toContain('CONTEXT_QUERY_TIMEOUT_MS');
    expect(contextService).toContain('withContextTimeout');
    expect(contextService).toContain('availableSecretMetadataOnly');
    expect(contextService).not.toContain('maskedValue');
    expect(contextService).not.toContain('encrypted_value');
  });
});
