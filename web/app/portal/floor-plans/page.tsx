import { Suspense } from 'react';
import { FloorPlansListClient } from './floor-plans-list-client';

export default function FloorPlansPage() {
  // The list reads ?projectId= to scope itself, and useSearchParams needs a
  // Suspense boundary or the route fails to prerender.
  return (
    <Suspense fallback={null}>
      <FloorPlansListClient />
    </Suspense>
  );
}
