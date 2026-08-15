"use client";

/**
 * The four auth screens share one shell.
 *
 * They are the same shape -- a narrow card, a heading, a short line of
 * explanation, some fields, one primary action and a way back -- so the layout
 * lives here and each page supplies only what differs.
 */

import Link from 'next/link';
import { ReactNode } from 'react';
import { EliteLayout } from '../components/elite-layout';

export function AuthShell({
  title,
  intro,
  error,
  notice,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  error?: string | null;
  notice?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <EliteLayout active="none">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-auth">
          <div className="de-auth-card">
            <h1>{title}</h1>
            {intro ? <p className="de-auth-intro">{intro}</p> : null}
            {error ? <p className="de-checkout-error" role="alert">{error}</p> : null}
            {notice ? <p className="de-auth-notice" role="status">{notice}</p> : null}
            {children}
            {footer ? <div className="de-auth-footer">{footer}</div> : null}
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="de-auth-link" href={href}>{children}</Link>;
}
