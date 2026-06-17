import ProjectDetailPage from '@/components/pages/ProjectDetailPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailPage projectId={id} />;
}
