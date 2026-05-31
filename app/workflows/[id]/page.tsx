import WorkflowsPage from '@/components/pages/WorkflowsPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowsPage selectedId={id} />;
}
