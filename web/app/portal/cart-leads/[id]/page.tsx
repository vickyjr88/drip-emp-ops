import CartLeadDetailClient from './cart-lead-detail-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function CartLeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CartLeadDetailClient leadId={id} />;
}
