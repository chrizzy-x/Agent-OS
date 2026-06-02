import StudioPage from '@/components/pages/StudioPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; prompt?: string }> }) {
  const params = await searchParams;
  return <StudioPage initialSessionId={params.session ?? null} initialPrompt={params.prompt ?? null} />;
}
