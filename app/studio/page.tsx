import StudioPage from '@/components/pages/StudioPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const params = await searchParams;
  return <StudioPage initialSessionId={params.session ?? null} />;
}
