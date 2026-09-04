import CampaignDetailClient from './campaign-detail-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CampaignDetailClient campaignId={id} />;
}
