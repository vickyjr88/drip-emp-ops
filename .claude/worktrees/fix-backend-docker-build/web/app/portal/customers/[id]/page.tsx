import CustomerDetailClient from './customer-detail-client';

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;

  return <CustomerDetailClient customerId={id} />;
}
