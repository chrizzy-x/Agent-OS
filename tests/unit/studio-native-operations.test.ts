import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/studio/providers.js', () => ({
  generateWithStudioProvider: vi.fn(() => {
    throw new Error('external provider should not classify native intents');
  }),
}));

import { detectAgentOSIntent, humanStatusForIntent } from '../../src/studio/intents.js';
import {
  buildNativeWorkflowPlan,
  detectNativeMissingCapability,
  parseNativeExecutionRecoveryRequest,
  parseNativePanicRequest,
  parseNativeRunWorkflowReference,
  parseNativeSurfaceNavigation,
} from '../../src/studio/native-operations.js';

describe('native Studio operations', () => {
  it('detects intents deterministically without external classification', async () => {
    await expect(detectAgentOSIntent('retry execution exec_123')).resolves.toBe('EXECUTION_TASK');
    await expect(detectAgentOSIntent('')).resolves.toBe('NORMAL_CHAT');
    expect(humanStatusForIntent('FFP_TASK')).toBe('Checking route history...');
  });

  it('parses native surface navigation', () => {
    expect(parseNativeSurfaceNavigation('open Vault')).toEqual(expect.objectContaining({
      href: '/vault',
      label: 'Vault',
      reply: 'Opening Vault.',
    }));
    expect(parseNativeSurfaceNavigation('show primeflows')).toEqual(expect.objectContaining({
      href: '/workflows',
      label: 'Primeflows',
    }));
  });

  it('parses approval-backed panic and recovery requests', () => {
    expect(parseNativePanicRequest('panic lockdown now')).toEqual(expect.objectContaining({
      action: 'panic_lockdown',
    }));
    expect(parseNativeExecutionRecoveryRequest('retry execution exec-123')).toEqual({
      action: 'retry',
      executionId: 'exec-123',
      approvalPrompt: 'Retry execution exec-123?',
    });
  });

  it('builds native workflow plans without provider output', () => {
    const plan = buildNativeWorkflowPlan('create workflow Daily release report daily');
    expect(plan.summary).toContain('Create a native AgentOS Primeflow');
    expect(plan.schedule).toBe('@daily');
    expect(plan.steps).toEqual([
      expect.objectContaining({
        order: 1,
        tool: 'agentos.mem_set',
        input: expect.objectContaining({ key: expect.stringMatching(/^studio\.workflow\./) }),
      }),
    ]);
    expect(parseNativeRunWorkflowReference('run workflow Daily release report')).toBe('Daily release report');
  });

  it('returns explicit missing capability for unsupported non-Derek paper trades', () => {
    const response = detectNativeMissingCapability('Paper trade without Derek: place a sandbox buy order and return the order id.');
    expect(response?.capability).toBe('non_derek_paper_broker_execution');
    expect(response?.reply).toContain('Missing capability');
    expect(response?.reply).toContain('No order was placed');
  });
});
