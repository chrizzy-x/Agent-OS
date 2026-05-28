import { describe, expect, it } from 'vitest';
import { sanitizeStudioPlan, type Plan } from '../../src/studio/planner.js';

describe('sanitizeStudioPlan', () => {
  it('removes invented Telegram delivery and keeps the in-app fetch result', () => {
    const plan: Plan = {
      summary: 'Fetch BTC price and send it to user tg.',
      steps: [
        {
          order: 1,
          tool: 'agentos.net_http_get',
          input: { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd' },
          description: 'Fetch BTC price',
        },
        {
          order: 2,
          tool: 'agentos.notify_send',
          input: { channel: 'telegram', to: 'user tg', message: 'BTC price' },
          description: 'Send to Telegram',
        },
      ],
      schedule: null,
      missingParams: [],
    };

    const sanitized = sanitizeStudioPlan('what is bitcoin price? return it here', plan);

    expect(sanitized.steps).toHaveLength(1);
    expect(sanitized.steps[0].tool).toBe('agentos.net_http_get');
    expect(sanitized.summary).toBe('AgentOS will run the requested steps and show the result here.');
  });

  it('keeps explicit email delivery when the recipient is in the instruction', () => {
    const plan: Plan = {
      summary: 'Email the result.',
      steps: [
        {
          order: 1,
          tool: 'agentos.notify_send',
          input: { channel: 'email', to: 'ops@example.com', message: 'Done' },
          description: 'Send email',
        },
      ],
      schedule: null,
      missingParams: [],
    };

    const sanitized = sanitizeStudioPlan('email ops@example.com when done', plan);

    expect(sanitized.steps).toHaveLength(1);
    expect(sanitized.steps[0].tool).toBe('agentos.notify_send');
  });

  it('removes scheduled notification when no destination was provided', () => {
    const plan: Plan = {
      summary: 'Monitor ETH and notify the user.',
      steps: [
        {
          order: 1,
          tool: 'agentos.proc_schedule',
          input: {
            expression: '0 * * * *',
            tool: 'agentos.notify_send',
            input: { channel: 'telegram', to: '<chat_id>', message: 'ETH moved' },
          },
          description: 'Schedule Telegram alert',
        },
      ],
      schedule: '0 * * * *',
      missingParams: [],
    };

    const sanitized = sanitizeStudioPlan('monitor eth every hour', plan);

    expect(sanitized.steps).toEqual([]);
    expect(sanitized.schedule).toBeNull();
  });
});
