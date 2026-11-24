import ReceiptClient from './receipt-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function OrderReceiptPage({ params }: PageProps) {
  const { id } = await params;
  return <ReceiptClient orderId={id} />;
}
