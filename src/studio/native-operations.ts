import crypto from 'crypto';
import type { AgentOSActionType } from '../actions/service.js';

export type WorkflowPlan = {
  summary: string;
  steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
  schedule: string | null;
};

export type NativeSurfaceNavigation = {
  href: string;
  label: string;
  reply: string;
};

export type NativePanicRequest = {
  action: Extract<AgentOSActionType, 'panic_pause' | 'panic_stop_all' | 'panic_lockdown'>;
  approvalPrompt: string;
  completionLabel: string;
};

export type NativeExecutionRecoveryRequest = {
  action: 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback' | 'inspect';
  executionId: string;
  approvalPrompt: string;
};

export type NativeMissingCapabilityResponse = {
  capability: string;
  reply: string;
};

const SURFACE_NAVIGATION: Array<{
  label: string;
  href: string;
  pattern: RegExp;
}> = [
  { label: 'Vault', href: '/vault', pattern: /\b(open|show|go to|navigate to|launch)\b.*\bvault\b|\bvault\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Library', href: '/library', pattern: /\b(open|show|go to|navigate to|launch)\b.*\blibrary\b|\blibrary\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Apps', href: '/apps', pattern: /\b(open|show|go to|navigate to|launch)\b.*\b(installed )?apps\b|\bapps\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Skills', href: '/skills/installed', pattern: /\b(open|show|go to|navigate to|launch)\b.*\b(installed )?skills\b|\bskills\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Prime Agents', href: '/agents', pattern: /\b(open|show|go to|navigate to|launch)\b.*\b(prime agents|agents|subagents)\b|\b(prime agents|agents|subagents)\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Primeflows', href: '/workflows', pattern: /\b(open|show|go to|navigate to|launch)\b.*\b(primeflows|workflows)\b|\b(primeflows|workflows)\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'MCP', href: '/mcp', pattern: /\b(open|show|go to|navigate to|launch)\b.*\bmcp\b|\bmcp\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Projects', href: '/projects', pattern: /\b(open|show|go to|navigate to|launch)\b.*\bprojects\b|\bprojects\b.*\b(open|show|go to|navigate to|launch)\b/i },
  { label: 'Notifications', href: '/notifications', pattern: /\b(open|show|go to|navigate to|launch)\b.*\b(notifications|approvals)\b|\b(notifications|approvals)\b.*\b(open|show|go to|navigate to|launch)\b/i },
];

function cleanInstruction(message: string): string {
  return message.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function scheduleForMessage(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\b(every hour|hourly)\b/.test(lower)) return '@hourly';
  if (/\b(every day|daily|each day)\b/.test(lower)) return '@daily';
  if (/\b(every week|weekly|each week)\b/.test(lower)) return '@weekly';
  return null;
}

export function buildNativeWorkflowPlan(message: string): WorkflowPlan {
  const instruction = cleanInstruction(message);
  const key = `studio.workflow.${crypto.createHash('sha256').update(instruction).digest('hex').slice(0, 16)}`;
  return {
    summary: `Create a native AgentOS workflow for: ${instruction}`,
    schedule: scheduleForMessage(message),
    steps: [
      {
        order: 1,
        tool: 'agentos.mem_set',
        input: {
          key,
          value: instruction,
        },
        description: 'Store the approved workflow request in AgentOS memory for the saved Primeflow record.',
      },
    ],
  };
}

export function parseNativeSurfaceNavigation(message: string): NativeSurfaceNavigation | null {
  const match = SURFACE_NAVIGATION.find(surface => surface.pattern.test(message));
  if (!match) return null;
  return {
    href: match.href,
    label: match.label,
    reply: `Opening ${match.label}.`,
  };
}

export function parseNativePanicRequest(message: string): NativePanicRequest | null {
  if (/\bpanic\b.*\blockdown\b|\blockdown\b.*\bpanic\b/i.test(message)) {
    return {
      action: 'panic_lockdown',
      approvalPrompt: 'Enable panic lockdown for active executions, MCP runtime access, and Vault runtime grants?',
      completionLabel: 'Panic lockdown completed',
    };
  }
  if (/\bpanic\b.*\bpause\b|\bpause\b.*\b(active )?executions\b/i.test(message)) {
    return {
      action: 'panic_pause',
      approvalPrompt: 'Pause active executions?',
      completionLabel: 'Panic pause completed',
    };
  }
  if (/\bpanic\b|\bstop all\b|\bcancel all active executions\b|\bstop active executions\b/i.test(message)) {
    return {
      action: 'panic_stop_all',
      approvalPrompt: 'Stop all active executions?',
      completionLabel: 'Panic stop completed',
    };
  }
  return null;
}

export function parseNativeExecutionRecoveryRequest(message: string): NativeExecutionRecoveryRequest | null {
  const match = message.match(/\b(pause|resume|retry|cancel|rollback|inspect)\s+(?:execution|task|run)\s+([a-z0-9._:-]+)/i);
  if (!match) return null;
  const action = match[1].toLowerCase() as NativeExecutionRecoveryRequest['action'];
  const executionId = match[2];
  return {
    action,
    executionId,
    approvalPrompt: `${action[0].toUpperCase()}${action.slice(1)} execution ${executionId}?`,
  };
}

export function parseNativeRunWorkflowReference(message: string): string | null {
  const match = message.match(/\b(?:run|execute|start|trigger)\s+(?:primeflow|workflow)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function detectNativeMissingCapability(message: string): NativeMissingCapabilityResponse | null {
  const lower = message.toLowerCase();
  const asksForTradeExecution = (
    /\b(paper\s*trade|paper\s*trading|broker|brokerage|sandbox\s+(?:buy|sell|order)|buy\s+order|sell\s+order|place\s+(?:a\s+)?(?:sandbox\s+)?(?:buy|sell)?\s*order)\b/i.test(lower)
    || /\b(trade|trading)\b/i.test(lower) && /\b(place|execute|submit|buy|sell|order|sandbox|paper)\b/i.test(lower)
  );

  if (!asksForTradeExecution) return null;

  return {
    capability: 'non_derek_paper_broker_execution',
    reply: [
      'Missing capability: no non-Derek paper-trading broker is connected to this workspace.',
      'Native Super AgentOS cannot place or simulate broker orders without an installed broker App, Skill, or Universal MCP tool, approved execution permission, and Vault-backed sandbox credentials.',
      'No order was placed. Connect a supported broker sandbox through Vault and approvals, then retry the trade execution task.',
    ].join('\n\n'),
  };
}
