import SupplierAccountClient from './supplier-account-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function SupplierAccountPage({ params }: PageProps) {
  const { id } = await params;
  return <SupplierAccountClient supplierId={id} />;
}
