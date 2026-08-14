import { FloorPlanDetailClient } from './floor-plan-detail-client';

export default function FloorPlanDetailPage({ params }: { params: { id: string } }) {
  return <FloorPlanDetailClient planId={params.id} />;
}
