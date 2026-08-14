"use client";

/**
 * Customers list.
 *
 * The list itself lived inside the old property dashboard and went with it.
 * Detail and create screens under this route still work, so this says so
 * rather than rendering a dashboard under a "Customers" heading.
 */

import Link from 'next/link';
import { EliteLayout } from '../../components/elite-layout';

export default function CustomersPage() {
  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main">
        <section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card">
            <h2 style={{ marginTop: 0 }}>Customers</h2>
            <p className="portal-muted">
              This list is not built yet for Drip Emporium. Adding and editing a customer still works from an order.
            </p>
            <Link href="/portal" className="portal-inline-btn">
              Back to Dashboard
            </Link>
          </article>
        </section>
      </main>
    </EliteLayout>
  );
}
