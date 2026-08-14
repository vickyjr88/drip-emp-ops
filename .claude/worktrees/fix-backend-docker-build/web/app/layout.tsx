import type { Metadata } from 'next';
import './globals.css';
import { PortalDialogProvider } from './portal/components/portal-dialog';

export const metadata: Metadata = {
  title: 'Dirrir Realtor Limited | Elite Estate Framework',
  description: 'Luxury property management and acquisition for discerning clientele.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortalDialogProvider>{children}</PortalDialogProvider>
      </body>
    </html>
  );
}
