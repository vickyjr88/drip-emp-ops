import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignupClient } from './signup-client';

export const metadata: Metadata = {
  title: 'Create an Account',
  description: 'Create a Drip Emporium account to track your orders.',
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <Suspense fallback={null}><SignupClient /></Suspense>;
}
