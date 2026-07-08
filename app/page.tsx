import HomePage from '@/components/pages/HomePage';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
