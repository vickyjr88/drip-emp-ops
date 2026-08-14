import UnitDetailClient from './unit-detail-client';

type UnitDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UnitDetailPage({ params }: UnitDetailPageProps) {
  const { id } = await params;

  return <UnitDetailClient unitId={id} />;
}