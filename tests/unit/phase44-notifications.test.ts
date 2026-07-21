import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { consolidateNotifications, type NotificationRecord } from '../../src/notifications/service.js';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

function notification(overrides: Partial<NotificationRecord>): NotificationRecord {
  return {
    id: 'notification-id',
    agentId: 'agent-id',
    workspaceId: 'workspace-id',
    sessionId: null,
    executionId: null,
    type: 'workflow',
    title: 'Workflow finished',
    body: 'Daily research completed.',
    status: 'unread',
    metadata: {},
    createdAt: '2026-07-21T10:00:00.000Z',
    readAt: null,
    ...overrides,
  };
}

describe('Phase 44 notifications', () => {
  it('consolidates duplicate non-security alerts', () => {
    const result = consolidateNotifications([
      notification({ id: 'older', createdAt: '2026-07-21T10:00:00.000Z' }),
      notification({ id: 'latest', createdAt: '2026-07-21T10:01:00.000Z' }),
      notification({ id: 'billing', type: 'billing', title: 'Invoice ready', body: 'Workspace invoice is available.' }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('latest');
    expect(result[0].metadata.consolidatedCount).toBe(2);
  });

  it('keeps security alerts individually visible', () => {
    const result = consolidateNotifications([
      notification({ id: 'session-1', type: 'security', title: 'New session', body: 'A desktop session signed in.' }),
      notification({ id: 'session-2', type: 'security', title: 'New session', body: 'A desktop session signed in.' }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map(item => item.id).sort()).toEqual(['session-1', 'session-2']);
  });

  it('documents and renders consolidated notification state', () => {
    const shell = source('components', 'os', 'application-shell.tsx');
    const doc = source('docs', 'notifications.md');

    expect(shell).toContain('notificationRepeatCount');
    expect(shell).toContain('alerts)');
    expect(doc).toContain('Duplicate non-security alerts are consolidated before display');
    expect(doc).toContain('Security, authentication, token, and session alerts are not consolidated.');
    expect(doc).toContain('No notifications');
  });
});
