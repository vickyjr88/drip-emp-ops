import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import ContactClient from './contact-client';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'contact',
    path: '/contact',
    title: 'Contact Us',
    description:
      'Get in touch with Drip Emporium about stock, sizing, orders or anything else. Phone, WhatsApp, email and shop details.',
    shareTitle: 'Contact Drip Emporium',
  });
}

export default function ContactPage() {
  return <ContactClient />;
}
