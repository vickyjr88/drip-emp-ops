import ResellerDetailClient from './reseller-detail-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function ResellerDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ResellerDetailClient resellerId={id} />;
}
