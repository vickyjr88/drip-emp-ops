import { PortalTourProvider } from './portal-tour-provider';

/**
 * Server component on purpose -- see portal-tour-provider.tsx for the full
 * story. This one line is what actually stops the entire staff portal from
 * being statically cached for a year after every deploy.
 */
export const dynamic = 'force-dynamic';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalTourProvider>{children}</PortalTourProvider>;
}
