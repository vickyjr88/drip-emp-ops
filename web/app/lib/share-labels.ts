/** How a share channel is named wherever the counts are shown (the affiliate's dashboard, a reseller's page for staff, Insights). */
export const SHARE_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  x: 'X',
  telegram: 'Telegram',
  share: 'Phone share sheet',
  link: 'Link copied',
  download: 'Picture saved',
};

export const shareChannelLabel = (channel: string) => SHARE_CHANNEL_LABELS[channel] ?? channel;

/** "WhatsApp 12, Facebook 3": the channels in a short run. */
export const describeShareChannels = (rows: Array<{ channel: string; count: number }>) => rows.map((r) => `${shareChannelLabel(r.channel)} ${r.count}`).join(', ');
