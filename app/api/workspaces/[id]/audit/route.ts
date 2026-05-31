import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { assertWorkspaceMembership, getWorkspaceAudit } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type AuditRecord = Awaited<ReturnType<typeof getWorkspaceAudit>>[number];

function toPublicAuditEntry(entry: AuditRecord) {
  return {
    id: entry.id,
    actorLabel: entry.actorId ? 'authenticated operator' : null,
    action: entry.action,
    metadata: omitAgentIdentifierFields(entry.metadata),
    createdAt: entry.createdAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    await assertWorkspaceMembership(id, agentContext.agentId);
    const audit = await getWorkspaceAudit(id);
    return NextResponse.json({ audit: audit.map(toPublicAuditEntry) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
