import type { Metadata } from 'next';
import { ShareClient } from './share-client';

export const metadata: Metadata = {
  title: 'Share products',
  description: 'Search the shop and share any product on WhatsApp and social media.',
  robots: { index: false, follow: false },
};

export default function SharePage() {
  return <ShareClient />;
}
