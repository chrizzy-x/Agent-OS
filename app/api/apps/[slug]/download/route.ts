import { NextRequest, NextResponse } from 'next/server';
import {
  buildAgentAppPackage,
  getAgentAppBySlug,
  recordAgentAppDownload,
} from '@/src/appstore/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const app = await getAgentAppBySlug(slug);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    await recordAgentAppDownload(app.slug);
    const filename = `${app.slug.replace(/[^a-z0-9-]/g, '')}.agentos-app.json`;

    return new NextResponse(JSON.stringify(buildAgentAppPackage(app), null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.agentos.app+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}
