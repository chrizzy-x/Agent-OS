import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { featureName, shortDesc } = await req.json();

    if (!featureName || !shortDesc) {
      return NextResponse.json({ error: 'featureName and shortDesc required' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Write a concise, compelling 2-3 sentence description for this Agent OS feature:

Feature: ${featureName}
Brief: ${shortDesc}

Focus on:
- What it does
- Why it's valuable for developers building autonomous agents
- How it's unique compared to rolling your own

Keep it under 60 words. Use active voice. No marketing fluff.`,
        },
      ],
    });

    const description =
      message.content[0].type === 'text' ? message.content[0].text : shortDesc;

    return NextResponse.json({ description });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate description';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
