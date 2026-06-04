import { Suspense } from 'react';
import WorkspacePage from '@/components/pages/WorkspacePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkspacePage />
    </Suspense>
  );
}
