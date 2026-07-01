import PublishSkillWizardPage from '@/components/pages/PublishSkillWizardPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const params = await searchParams;
  return <PublishSkillWizardPage initialSlug={params.slug ?? null} />;
}
