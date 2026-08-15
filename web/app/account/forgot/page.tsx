import type { Metadata } from 'next';
import { ForgotClient } from './forgot-client';

export const metadata: Metadata = {
  title: 'Reset Your Password',
  robots: { index: false, follow: true },
};

export default function ForgotPage() {
  return <ForgotClient />;
}
