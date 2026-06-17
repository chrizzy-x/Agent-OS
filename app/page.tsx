import StudioPage from '@/components/pages/StudioPage';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudioPage initialMode="nl" />
    </Suspense>
  );
}
