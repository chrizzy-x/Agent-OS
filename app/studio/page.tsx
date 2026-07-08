import StudioPage from '@/components/pages/StudioPage';
import { normalizeStudioMode } from '@/src/studio/modes';
import type { StudioMode } from '@/src/studio/types';
import { Suspense } from 'react';

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; prompt?: string; mode?: StudioMode }> }) {
  const params = await searchParams;
  return (
    <Suspense fallback={null}>
      <StudioPage
        initialSessionId={params.session ?? null}
        initialPrompt={params.prompt ?? null}
        initialMode={normalizeStudioMode(params.mode)}
      />
    </Suspense>
  );
}
