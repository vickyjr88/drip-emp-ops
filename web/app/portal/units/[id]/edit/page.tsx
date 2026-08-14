import UnitEditClient from './unit-edit-client';

type UnitEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UnitEditPage({ params }: UnitEditPageProps) {
  const { id } = await params;
  return <UnitEditClient unitId={id} />;
}