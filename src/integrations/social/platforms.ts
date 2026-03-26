import {
  getTelegramBotUsername,
  hasGoogleOAuthConfig,
  hasMetaOAuthConfig,
  hasTelegramBotConfig,
  hasXOAuthConfig,
} from '../../config/env.js';
import { listXAccountsForAgent } from '../x/service.js';

export type SocialPlatformId = 'x' | 'facebook' | 'instagram' | 'telegram' | 'youtube' | 'whatsapp';
export type SocialPlatformStatus = 'live' | 'scaffolded';
export type SocialAuthMode = 'oauth_user' | 'bot_token' | 'business_access';
export type SocialAccountType = 'profile' | 'page' | 'business' | 'bot' | 'channel' | 'number';

export interface SocialPlatformCatalogEntry {
  id: SocialPlatformId;
  label: string;
  status: SocialPlatformStatus;
  connectorReady: boolean;
  connectedCount: number;
  authMode: SocialAuthMode;
  accountType: SocialAccountType;
  dashboardHref?: string;
  summary: string;
  requirements: string[];
}

export function buildSocialPlatformCatalog(options?: {
  xConnectedCount?: number;
}): SocialPlatformCatalogEntry[] {
  const xConnectedCount = Math.max(0, Number(options?.xConnectedCount ?? 0));
  const telegramReady = hasTelegramBotConfig();
  const telegramBotUsername = getTelegramBotUsername();

  return [
    {
      id: 'x',
      label: 'X',
      status: 'live',
      connectorReady: hasXOAuthConfig(),
      connectedCount: xConnectedCount,
      authMode: 'oauth_user',
      accountType: 'profile',
      dashboardHref: '/dashboard/x',
      summary: 'Live connector with approval-first drafts, queue management, cron sync, and child-agent isolation.',
      requirements: [
        'Configure X OAuth credentials and redirect URI.',
        'Connect each managed X account through the AgentOS OAuth flow.',
      ],
    },
    {
      id: 'facebook',
      label: 'Facebook',
      status: 'scaffolded',
      connectorReady: hasMetaOAuthConfig(),
      connectedCount: 0,
      authMode: 'oauth_user',
      accountType: 'page',
      summary: 'Next connector target for page publishing, moderation queues, and account policies.',
      requirements: [
        'Provide shared Meta app credentials.',
        'Define which Facebook pages this platform is allowed to manage.',
      ],
    },
    {
      id: 'instagram',
      label: 'Instagram',
      status: 'scaffolded',
      connectorReady: hasMetaOAuthConfig(),
      connectedCount: 0,
      authMode: 'oauth_user',
      accountType: 'business',
      summary: 'Planned connector for approval-based publishing and account-specific content guardrails.',
      requirements: [
        'Reuse the shared Meta app credentials.',
        'Connect eligible Instagram business accounts before enabling publishing.',
      ],
    },
    {
      id: 'telegram',
      label: 'Telegram',
      status: 'scaffolded',
      connectorReady: telegramReady,
      connectedCount: 0,
      authMode: 'bot_token',
      accountType: 'bot',
      summary: 'Bot-driven connector planned for channel posting, inbox triage, and moderation workflows.',
      requirements: [
        'Add a Telegram bot token for the managed bot identity.',
        telegramBotUsername ? `Current bot handle detected: @${telegramBotUsername}.` : 'Optionally provide the bot username for operator visibility.',
      ],
    },
    {
      id: 'youtube',
      label: 'YouTube',
      status: 'scaffolded',
      connectorReady: hasGoogleOAuthConfig(),
      connectedCount: 0,
      authMode: 'oauth_user',
      accountType: 'channel',
      summary: 'Planned connector for channel publishing support, comment review queues, and performance sync.',
      requirements: [
        'Provide Google OAuth credentials and redirect URI.',
        'Connect each YouTube channel through the shared operator flow before enabling actions.',
      ],
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      status: 'scaffolded',
      connectorReady: hasMetaOAuthConfig(),
      connectedCount: 0,
      authMode: 'business_access',
      accountType: 'number',
      summary: 'Planned connector for business messaging queues, operator review, and account-specific guardrails.',
      requirements: [
        'Reuse the shared Meta app credentials.',
        'Register the WhatsApp business sender assets this platform is allowed to operate.',
      ],
    },
  ];
}

export async function listSocialPlatformsForAgent(agentId: string): Promise<SocialPlatformCatalogEntry[]> {
  const xAccounts = await listXAccountsForAgent(agentId);
  return buildSocialPlatformCatalog({ xConnectedCount: xAccounts.length });
}
