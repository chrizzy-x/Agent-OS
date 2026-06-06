'use client';

import StudioShell from '@/components/studio/StudioShell';
import { StudioProvider } from '@/components/studio/StudioProvider';
import type { StudioMode } from '@/src/studio/types';

export default function StudioPage(props: {
  initialSessionId?: string | null;
  initialPrompt?: string | null;
  initialMode?: StudioMode;
}) {
  return (
    <StudioProvider
      initialSessionId={props.initialSessionId}
      initialPrompt={props.initialPrompt}
      initialMode={props.initialMode}
    >
      <StudioShell />
    </StudioProvider>
  );
}
