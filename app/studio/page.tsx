import StudioPage from '@/components/pages/StudioPage';
import type { StudioMode } from '@/src/studio/types';
import { Suspense } from 'react';

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; prompt?: string; mode?: StudioMode }> }) {
  const params = await searchParams;
  return (
    <Suspense fallback={null}>
      <StudioPage
        initialSessionId={params.session ?? null}
        initialPrompt={params.prompt ?? null}
        initialMode={params.mode === 'code' || params.mode === 'workflow' ? params.mode : 'nl'}
      />
    </Suspense>
  );
}
