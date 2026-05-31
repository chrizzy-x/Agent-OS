import PublishWizardPage from '@/components/pages/PublishWizardPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const params = await searchParams;
  return <PublishWizardPage initialSlug={params.slug ?? null} />;
}
