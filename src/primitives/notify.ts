import { z } from 'zod';
import { withAudit } from '../runtime/audit.js';
import { validate } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import type { AgentContext } from '../auth/permissions.js';

export async function notifySend(
  ctx: AgentContext,
  input: unknown,
): Promise<{ channel: string; to: string; status: string; id?: string }> {
  const { channel, to, message, subject } = validate(
    z.object({
      channel: z.enum(['email', 'whatsapp', 'sms', 'telegram', 'slack', 'discord', 'webhook']),
      to: z.string().min(1),
      message: z.string().min(1),
      subject: z.string().optional(),
    }),
    input,
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'notify', operation: 'send', metadata: { channel } },
    async () => {
      if (channel === 'email') {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new ValidationError('Email notifications are not configured for this AgentOS deployment.');
        const from = process.env.NOTIFY_FROM_EMAIL ?? 'AgentOS <notifications@resend.dev>';
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject: subject ?? 'Agent Notification', text: message }),
        });
        const data = await res.json() as { id?: string; message?: string };
        if (!res.ok) throw new ValidationError(`Email send failed: ${data.message ?? res.status}`);
        return { channel, to, status: 'sent', id: data.id };
      }

      if (channel === 'whatsapp' || channel === 'sms') {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM;
        if (!accountSid || !authToken || !from) {
          throw new ValidationError(`${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} notifications are not configured for this AgentOS deployment.`);
        }
        const toFormatted = channel === 'whatsapp' && !to.startsWith('whatsapp:') ? `whatsapp:${to}` : to;
        const body = new URLSearchParams({ From: from, To: toFormatted, Body: message });
        const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          },
        );
        const data = await res.json() as { sid?: string; message?: string };
        if (!res.ok) throw new ValidationError(`${channel} send failed: ${data.message ?? res.status}`);
        return { channel, to, status: 'sent', id: data.sid };
      }

      if (channel === 'telegram') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) throw new ValidationError('Telegram notifications are not configured for this AgentOS deployment.');
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: to, text: message }),
        });
        const data = await res.json() as { ok?: boolean; description?: string; result?: { message_id?: number } };
        if (!res.ok || !data.ok) throw new ValidationError(`Telegram send failed: ${data.description ?? res.status}`);
        return { channel, to, status: 'sent', id: String(data.result?.message_id ?? '') };
      }

      if (channel === 'slack' || channel === 'discord' || channel === 'webhook') {
        // `to` is the webhook URL
        const res = await fetch(to, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            channel === 'slack' ? { text: message } :
            channel === 'discord' ? { content: message } :
            { message },
          ),
        });
        if (!res.ok) throw new ValidationError(`${channel} webhook POST failed: ${res.status}`);
        return { channel, to, status: 'sent' };
      }

      throw new Error(`Unknown channel: ${String(channel)}`);
    },
  );
}
