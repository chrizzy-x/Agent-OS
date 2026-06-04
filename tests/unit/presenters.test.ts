import { describe, expect, it } from 'vitest';
import {
  summarizeAgentResult,
  summarizeSkillCapability,
  summarizeStudioEvent,
  summarizeWorkflowRun,
  summarizeValue,
} from '../../src/ui/presenters.js';

describe('ui presenters', () => {
  it('summarizes common studio events for normal chat', () => {
    expect(summarizeStudioEvent('thinking_started', {})).toBe('Analyzing request');
    expect(summarizeStudioEvent('workflow_created', { name: 'Deploy app' })).toBe('Deploy app');
    expect(summarizeStudioEvent('secret_required', { secretName: 'OPENAI_API_KEY' })).toBe('OPENAI_API_KEY');
  });

  it('summarizes payloads without exposing raw JSON blobs', () => {
    expect(summarizeValue({ status: 'ready', count: 2 })).toBe('status: ready');
    expect(summarizeWorkflowRun({ answer: 'Done and verified.' })).toBe('Done and verified.');
    expect(summarizeAgentResult({ result: { message: 'Completed task' } })).toBe('message: Completed task');
    expect(summarizeSkillCapability({ query: 'string', limit: 'number' }, 'records')).toBe('2 inputs | Returns records');
  });
});
