import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginClient } from './login-client';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to track your Drip Emporium orders.',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <Suspense fallback={null}><LoginClient /></Suspense>;
}
