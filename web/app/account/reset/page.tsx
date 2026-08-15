import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetClient } from './reset-client';

export const metadata: Metadata = {
  title: 'Set a New Password',
  robots: { index: false, follow: false },
};

export default function ResetPage() {
  return <Suspense fallback={null}><ResetClient /></Suspense>;
}
