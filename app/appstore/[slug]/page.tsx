import { notFound } from 'next/navigation';
import AppDetailPage, { type AppDetailRecord } from '@/components/pages/AppDetailPage';
import { getAgentAppBySlug } from '@/src/appstore/service';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await getAgentAppBySlug(slug, {
    viewerAgentId: null,
    viewerWorkspaceIds: [],
    canManageAll: false,
  });
  if (!app) notFound();
  return <AppDetailPage initialApp={omitAgentIdentifierFields(app) as AppDetailRecord} />;
}
