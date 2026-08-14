import SalesContractDetailClient from './sales-contract-detail-client';

type SalesContractDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SalesContractDetailPage({ params }: SalesContractDetailPageProps) {
  const { id } = await params;

  return <SalesContractDetailClient contractId={id} />;
}
