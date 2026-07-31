import { describe, expect, it } from 'vitest';
import { detectIntentHeuristically, translateMessageToStudioCommand } from '../../src/studio/intents.js';

describe('Studio intent command translation', () => {
  it('passes exact executable Studio command forms through from NL Studio', () => {
    expect(translateMessageToStudioCommand('skills use proof-normalizer normalize --json {"text":"Hello"}'))
      .toBe('skills use proof-normalizer normalize --json {"text":"Hello"}');
    expect(translateMessageToStudioCommand('mcp call agentos mem_set --json {"key":"proof","value":"ok"}'))
      .toBe('mcp call agentos mem_set --json {"key":"proof","value":"ok"}');
    expect(translateMessageToStudioCommand('tool run agentos.mem_get --json {"key":"proof"}'))
      .toBe('tool run agentos.mem_get --json {"key":"proof"}');
  });

  it('detects Primeflow requests as workflow execution intents', () => {
    expect(detectIntentHeuristically('Create Primeflow Proof Run')).toBe('WORKFLOW_DESIGN');
    expect(detectIntentHeuristically('Run Primeflow Proof Run')).toBe('WORKFLOW_EXECUTION');
  });
});
