"use client";

import Image from 'next/image';
import Link from 'next/link';
import { EliteLayout } from '../components/elite-layout';
import { FavoriteButton } from '../components/favorite-button';
import { useCustomerAuth } from '../lib/customer-auth';
import { useFavorites } from '../lib/favorites';
import { formatKes } from '../lib/shop';

export function FavoritesClient() {
  const auth = useCustomerAuth();
  const favorites = useFavorites();

  // Mirrors cart-client.tsx's own not-ready guard: nothing renders until
  // both the token read and the favorites fetch have settled, so a
  // signed-in visitor never sees a false "no favorites" flash.
  if (!auth.ready || !favorites.ready) {
    return (
      <EliteLayout active="shop">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-shop-head">
            <h1>Your favorites</h1>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!auth.token) {
    return (
      <EliteLayout active="shop">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-shop-head">
            <h1>Your favorites</h1>
          </section>
          <section className="lp-container">
            <div className="de-empty">
              <p>Sign in to save and view your favorite products.</p>
              <Link href="/account/login" className="lp-button lp-button-primary">Sign In</Link>
            </div>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (favorites.items.length === 0) {
    return (
      <EliteLayout active="shop">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-shop-head">
            <h1>Your favorites</h1>
          </section>
          <section className="lp-container">
            <div className="de-empty">
              <p>Nothing saved yet.</p>
              <Link href="/shop" className="lp-button lp-button-primary">Shop Shoes</Link>
            </div>
          </section>
        </main>
      </EliteLayout>
    );
  }

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <h1>Your favorites</h1>
          <p>{favorites.items.length} saved</p>
        </section>
        <section className="lp-container de-grid">
          {favorites.items.map((item) => (
            <article key={item.productId} className="de-card">
              <Link href={`/shop/${item.slug}`} className="de-card-media">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" style={{ objectFit: 'cover' }} />
                ) : (
                  <span className="de-card-placeholder" aria-hidden="true">{item.name.charAt(0)}</span>
                )}
              </Link>
              <div className="de-card-overlay-actions">
                <FavoriteButton compact productId={item.productId} />
              </div>
              <div className="de-card-body">
                <h3><Link href={`/shop/${item.slug}`}>{item.name}</Link></h3>
                {item.priceFrom != null ? <p className="de-card-price">{formatKes(item.priceFrom)}</p> : null}
              </div>
            </article>
          ))}
        </section>
      </main>
    </EliteLayout>
  );
}
