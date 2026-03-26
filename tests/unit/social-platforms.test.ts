import { beforeEach, describe, expect, it } from 'vitest';
import { buildSocialPlatformCatalog } from '../../src/integrations/social/platforms.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

describe('social platform catalog', () => {
  it('builds all supported platforms and carries X connection counts', () => {
    const platforms = buildSocialPlatformCatalog({ xConnectedCount: 3 });

    expect(platforms.map(platform => platform.id)).toEqual([
      'x',
      'facebook',
      'instagram',
      'telegram',
      'youtube',
      'whatsapp',
    ]);

    const xPlatform = platforms.find(platform => platform.id === 'x');
    expect(xPlatform).toMatchObject({
      status: 'live',
      connectedCount: 3,
      dashboardHref: '/dashboard/x',
    });
  });

  it('marks scaffolded platforms ready only when their credentials exist', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_APP_SECRET = 'meta-app-secret';
    process.env.META_REDIRECT_URI = 'https://agentos-app.vercel.app/api/meta/callback';
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-bot-token';
    process.env.TELEGRAM_BOT_USERNAME = 'agentos_ops_bot';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'https://agentos-app.vercel.app/api/youtube/callback';

    const platforms = buildSocialPlatformCatalog();
    const facebook = platforms.find(platform => platform.id === 'facebook');
    const instagram = platforms.find(platform => platform.id === 'instagram');
    const telegram = platforms.find(platform => platform.id === 'telegram');
    const youtube = platforms.find(platform => platform.id === 'youtube');
    const whatsapp = platforms.find(platform => platform.id === 'whatsapp');

    expect(facebook?.connectorReady).toBe(true);
    expect(instagram?.connectorReady).toBe(true);
    expect(telegram?.connectorReady).toBe(true);
    expect(telegram?.requirements[1]).toContain('@agentos_ops_bot');
    expect(youtube?.connectorReady).toBe(true);
    expect(whatsapp?.connectorReady).toBe(true);
    expect(whatsapp?.authMode).toBe('business_access');
  });
});
