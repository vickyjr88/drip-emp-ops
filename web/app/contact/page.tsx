import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import ContactClient from './contact-client';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'contact',
    path: '/contact',
    title: 'Contact Us',
    description:
      'Get in touch with Dirrir Realtors about a property, a viewing, or managing your portfolio. Phone, email and office details.',
    shareTitle: 'Contact Dirrir Realtors',
  });
}

export default function ContactPage() {
  return <ContactClient />;
}
