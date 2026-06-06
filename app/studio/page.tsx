import StudioPage from '@/components/pages/StudioPage';
import type { StudioMode } from '@/src/studio/types';

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; prompt?: string; mode?: StudioMode }> }) {
  const params = await searchParams;
  return (
    <StudioPage
      initialSessionId={params.session ?? null}
      initialPrompt={params.prompt ?? null}
      initialMode={params.mode === 'code' ? 'code' : 'nl'}
    />
  );
}
