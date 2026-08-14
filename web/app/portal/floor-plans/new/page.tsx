import { Suspense } from 'react';
import { FloorPlanFormClient } from '../floor-plan-form-client';

export default function NewFloorPlanPage() {
  // The form reads ?projectId= to preselect a project, and useSearchParams
  // needs a Suspense boundary or the route fails to prerender.
  return (
    <Suspense fallback={null}>
      <FloorPlanFormClient />
    </Suspense>
  );
}
