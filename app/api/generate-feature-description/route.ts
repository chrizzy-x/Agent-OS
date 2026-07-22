import { NextRequest, NextResponse } from 'next/server';
import { generateWithStudioProvider, getStudioProviderStatus } from '@/src/studio/providers';
import { sanitizeErrorMessage } from '@/src/utils/output-sanitizer';

export async function POST(req: NextRequest) {
  try {
    const { featureName, shortDesc } = await req.json();

    if (!featureName || !shortDesc) {
      return NextResponse.json({ error: 'featureName and shortDesc required' }, { status: 400 });
    }

    const providerStatus = getStudioProviderStatus();
    const prompt = `Write a concise, compelling 2-3 sentence description for this AgentOS feature:

Feature: ${featureName}
Brief: ${shortDesc}

Focus on:
- What it does
- Why it's valuable for developers building autonomous agents
- How it's unique compared to rolling your own

Keep it under 60 words. Use active voice. No marketing fluff.`;

    const result = await generateWithStudioProvider({
      system: 'You write concise AgentOS product copy. Return only the finished description.',
      user: prompt,
      maxTokens: 200,
    });

    if (!result?.text) {
      return NextResponse.json({
        description: shortDesc,
        generated: false,
        provider: {
          mode: providerStatus.mode,
          label: providerStatus.label,
        },
        message: providerStatus.message,
      });
    }

    return NextResponse.json({
      description: result.text.trim(),
      generated: true,
      provider: {
        mode: providerStatus.mode,
        label: providerStatus.label,
      },
    });
  } catch (error: unknown) {
    const message = sanitizeErrorMessage(error) || 'Failed to generate description';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
