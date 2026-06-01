import { Suspense } from 'react';
import SearchPage from '@/components/pages/SearchPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
