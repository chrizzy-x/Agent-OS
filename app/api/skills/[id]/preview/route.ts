import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { buildSkillPreview, getSkillByIdOrSlug } from '@/src/skills/marketplace';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const skill = await getSkillByIdOrSlug(id);
    if (!skill) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Skill not found', message: 'Skill not found' }, { status: 404 });
    }
    return NextResponse.json(omitAgentIdentifierFields({ skill, preview: buildSkillPreview(skill) }));
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
