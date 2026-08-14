import { FloorPlanFormClient } from '../../floor-plan-form-client';

export default function EditFloorPlanPage({ params }: { params: { id: string } }) {
  return <FloorPlanFormClient planId={params.id} />;
}
