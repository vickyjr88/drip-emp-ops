"use client";

/**
 * Share: search the shop and send any product to WhatsApp, Facebook, X, Telegram or anywhere the phone's own share sheet reaches (Instagram, TikTok,
 * Messages). For every signed-in customer, and for affiliates it also carries their referral code, so a sale from the link is credited to them, and a
 * daily kit of ready 9:16 pictures to post as a WhatsApp Status. Nothing is posted for anyone: WhatsApp and the social networks offer no way for a
 * website to do that, so this opens their own share screens with the product, the price and the link already in place.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from '../../components/elite-layout';
import { WhatsAppIcon } from '../../components/contact-icons';
import { customerApi, useCustomerAuth } from '../../lib/customer-auth';
import { ShopProduct, fetchProducts, priceLabel } from '../../lib/shop';
import { fetchWatches, watchPath } from '../../lib/watches';
import { absoluteUrl } from '../../lib/site';
import { ShareChannel, buildShareLink, channelHref, pictureFileName } from '../../lib/share-links';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type Hit = ShopProduct & { isWatch?: boolean };
type KitItem = { slug: string; name: string; priceFrom: number; priceTo: number; offer: { price: number; was: number } | null; sizes: string[]; link: string; caption: string };
type Kit = { day: string; items: KitItem[] };
type Picture = { url: string; blob: Blob } | 'failed';

const pathOf = (p: Hit) => (p.isWatch ? watchPath(p.slug) : `/shop/${p.slug}`);
const MAX_RESULTS = 24;
const DEBOUNCE_MS = 250;

/** The picture as a file, shared into the phone's share sheet (where WhatsApp > My status takes it) or, on a computer, downloaded. */
async function sharePicture(picture: { url: string; blob: Blob }, slug: string, text: string): Promise<'shared' | 'downloaded' | 'closed'> {
  const file = new File([picture.blob], pictureFileName(slug), { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  try {
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch (error) {
    // The person closed the share sheet: nothing went wrong.
    if ((error as Error)?.name === 'AbortError') return 'closed';
  }
  const a = document.createElement('a');
  a.href = picture.url;
  a.download = pictureFileName(slug);
  a.click();
  return 'downloaded';
}

export function ShareClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const customer = auth.customer;
  const token = auth.token;
  // The same test the account page uses: a reseller or wholesale customer with a referral code.
  const affiliate = Boolean(customer?.priceTier && customer.priceTier !== 'RETAIL' && customer.referralCode);
  const code = affiliate ? customer?.referralCode ?? null : null;

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [popular, setPopular] = useState<Hit[]>([]);
  const [kit, setKit] = useState<Kit | null>(null);
  const [kitFailed, setKitFailed] = useState(false);
  const [pictures, setPictures] = useState<Record<string, Picture>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const latest = useRef(0);
  const loadingPictures = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (auth.ready && !auth.customer) router.replace('/account/login');
  }, [auth.ready, auth.customer, router]);

  const say = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  // Without the sign-in on purpose: what is shared is the price anyone sees, not the trade price an affiliate is shown.
  useEffect(() => {
    void fetchProducts({}).then((rows) => setPopular((Array.isArray(rows) ? rows : []).slice(0, 8)));
  }, []);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults(null); setSearching(false); return; }
    const id = ++latest.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void Promise.all([fetchProducts({ search: q }), fetchWatches({ search: q })]).then(([rows, watchRows]) => {
        // A slower earlier request must not overwrite a newer one's results.
        if (id !== latest.current) return;
        const merged = [...(Array.isArray(rows) ? rows : []), ...watchRows.map((w) => ({ ...w, isWatch: true } as unknown as Hit))];
        setResults(merged.slice(0, MAX_RESULTS));
        setSearching(false);
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term]);

  // The affiliate's daily kit.
  useEffect(() => {
    if (!affiliate || !token) return;
    customerApi<Kit>('/customer-portal/share-kit', { method: 'GET' }, token).then(setKit).catch(() => setKitFailed(true));
  }, [affiliate, token]);

  // The pictures need the sign-in to fetch, so they are fetched here and shown from memory.
  const loadPicture = useCallback(async (slug: string): Promise<Picture> => {
    if (!token) return 'failed';
    const response = await fetch(`${API}/customer-portal/share-kit/picture/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return 'failed';
    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), blob };
  }, [token]);

  useEffect(() => {
    if (!kit) return;
    for (const item of kit.items) {
      if (pictures[item.slug] || loadingPictures.current.has(item.slug)) continue;
      loadingPictures.current.add(item.slug);
      void loadPicture(item.slug)
        .catch((): Picture => 'failed')
        .then((picture) => setPictures((prev) => ({ ...prev, [item.slug]: picture })))
        .finally(() => loadingPictures.current.delete(item.slug));
    }
  }, [kit, pictures, loadPicture]);

  if (!auth.ready || !customer) {
    return (
      <EliteLayout active="none">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-auth"><div className="de-auth-card"><h1>Loading…</h1></div></section>
        </main>
      </EliteLayout>
    );
  }

  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); say(done); } catch { say('Could not copy. Press and hold the text to copy it.'); }
  };

  /** Opens a channel's own share screen (or the phone's share sheet, or copies) for one product. */
  async function shareProduct(product: Hit, channel: ShareChannel) {
    const link = buildShareLink(absoluteUrl(pathOf(product)), { code, channel });
    const text = `${product.name}\n${priceLabel(product)}`;
    if (channel === 'link') return copy(link, 'Link copied. Paste it anywhere.');
    if (channel === 'share') {
      if (navigator.share) {
        try { await navigator.share({ title: product.name, text, url: link }); } catch (error) { if ((error as Error)?.name !== 'AbortError') await copy(link, 'Link copied. Paste it anywhere.'); }
        return;
      }
      return copy(link, 'Link copied. Paste it into Instagram, TikTok or any chat.');
    }
    const href = channelHref(channel, { link, text });
    if (href) window.open(href, '_blank', 'noopener');
  }

  async function pictureFor(product: Hit) {
    say('Making the picture…');
    const picture = pictures[product.slug] ?? await loadPicture(product.slug).catch((): Picture => 'failed');
    if (picture === 'failed') { say('There is no picture for this one: it needs to be in stock with a photo.'); return; }
    setPictures((prev) => ({ ...prev, [product.slug]: picture }));
    const link = buildShareLink(absoluteUrl(pathOf(product)), { code, channel: 'whatsapp' });
    const result = await sharePicture(picture, product.slug, `${product.name}\n${priceLabel(product)}\n\n🛒 ${link}`);
    if (result === 'downloaded') say('Downloaded. Open WhatsApp > Status and add it from your gallery, then paste the text.');
    else say('');
  }

  async function shareKitPicture(item: KitItem) {
    const picture = pictures[item.slug];
    if (!picture || picture === 'failed') return;
    const result = await sharePicture(picture, item.slug, item.caption);
    if (result === 'downloaded') {
      await copy(item.caption, 'Picture downloaded and the text copied. Open WhatsApp > Status, add the picture, and paste the text.');
    }
  }

  function downloadKitPicture(item: KitItem) {
    const picture = pictures[item.slug];
    if (!picture || picture === 'failed') return;
    const a = document.createElement('a');
    a.href = picture.url;
    a.download = pictureFileName(item.slug);
    a.click();
  }

  const searchingNow = term.trim().length >= 2;
  const shown = searchingNow ? results : popular;

  return (
    <EliteLayout active="none">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <p style={{ margin: '0 0 10px' }}><Link href="/account">← Back to your account</Link></p>
          <h1>{affiliate ? 'Share & earn' : 'Share products'}</h1>
          <p>
            {affiliate
              ? 'Search any product and share it on WhatsApp or social media. Every link carries your code, so anyone who buys through it is credited to you.'
              : 'Search any product and send it to a friend on WhatsApp or social media.'}
          </p>
        </section>

        <section className="lp-container">
          <div className="de-sharekit-search">
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search Nike, Jordan, Samba, a watch…"
              aria-label="Search products to share"
              autoComplete="off"
            />
          </div>
          <div className="de-sharekit-live" role="status" aria-live="polite">{notice}</div>
        </section>

        {affiliate && !searchingNow ? (
          <section className="lp-container" aria-label="Today's status kit">
            <h2 className="de-sharekit-h">Today&apos;s Status kit</h2>
            <p className="de-checkout-note" style={{ marginTop: 0 }}>
              Ready pictures for your WhatsApp Status, each with the text and your link. Tap <strong>Share picture</strong>, choose <strong>My status</strong>, and post.
              WhatsApp does not let any website post a Status for you, so this is as quick as it can be made. A new set arrives every day.
            </p>
            {kitFailed ? (
              <p className="de-checkout-error">Today&apos;s kit could not be loaded. Search below to share any product.</p>
            ) : !kit ? (
              <p className="de-auth-intro">Preparing today&apos;s pictures…</p>
            ) : kit.items.length === 0 ? (
              <div className="de-empty"><p>No product is in stock with a photo right now. Search below to share a product link.</p></div>
            ) : (
              <div className="de-sharekit-kit">
                {kit.items.map((item) => {
                  const picture = pictures[item.slug];
                  return (
                    <article key={item.slug} className="de-sharekit-card">
                      <div className="de-sharekit-shot">
                        {picture && picture !== 'failed' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={picture.url} alt={`Status picture for ${item.name}`} />
                        ) : (
                          <span>{picture === 'failed' ? 'No picture for this one' : 'Making the picture…'}</span>
                        )}
                      </div>
                      <strong className="de-sharekit-name">{item.name}</strong>
                      <div className="de-sharekit-actions">
                        <button type="button" className="lp-button lp-button-primary" disabled={!picture || picture === 'failed'} onClick={() => void shareKitPicture(item)}>
                          Share picture
                        </button>
                        <a
                          className="lp-button lp-button-ghost"
                          href={`https://wa.me/?text=${encodeURIComponent(item.caption)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <WhatsAppIcon /> Send as a message
                        </a>
                        <button type="button" className="lp-button lp-button-ghost" onClick={() => void copy(item.caption, 'Text copied, with your link.')}>Copy text</button>
                        <button type="button" className="lp-button lp-button-ghost" disabled={!picture || picture === 'failed'} onClick={() => downloadKitPicture(item)}>Download</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        <section className="lp-container" aria-label={searchingNow ? 'Search results' : 'Popular products'}>
          <h2 className="de-sharekit-h">{searchingNow ? 'Results' : affiliate ? 'Or share any product' : 'Popular right now'}</h2>
          {searchingNow && searching && shown === null ? <p className="de-auth-intro">Searching…</p> : null}
          {shown && shown.length === 0 ? (
            <div className="de-empty"><p>{searchingNow ? `Nothing matches “${term.trim()}”.` : 'No products to show yet.'}</p></div>
          ) : null}
          <div className="de-sharekit-list">
            {(shown ?? []).map((product) => {
              const image = Array.isArray(product.imageUrls) ? product.imageUrls[0] : null;
              return (
                <article key={`${product.isWatch ? 'w' : 's'}-${product.id}`} className="de-sharekit-row">
                  <Link href={pathOf(product)} className="de-sharekit-thumb" aria-label={product.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{product.name.charAt(0)}</span>}
                  </Link>
                  <div className="de-sharekit-info">
                    <strong>{product.name}</strong>
                    <span>{[product.brand, priceLabel(product)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="de-sharekit-buttons" role="group" aria-label={`Share ${product.name}`}>
                    <button type="button" className="de-sharekit-btn is-wa" onClick={() => void shareProduct(product, 'whatsapp')}><WhatsAppIcon /> WhatsApp</button>
                    <button type="button" className="de-sharekit-btn" onClick={() => void shareProduct(product, 'facebook')}>Facebook</button>
                    <button type="button" className="de-sharekit-btn" onClick={() => void shareProduct(product, 'x')}>X</button>
                    <button type="button" className="de-sharekit-btn" onClick={() => void shareProduct(product, 'telegram')}>Telegram</button>
                    <button type="button" className="de-sharekit-btn" onClick={() => void shareProduct(product, 'share')}>More…</button>
                    <button type="button" className="de-sharekit-btn" onClick={() => void shareProduct(product, 'link')}>Copy link</button>
                    {affiliate && !product.isWatch ? (
                      <button type="button" className="de-sharekit-btn is-picture" onClick={() => void pictureFor(product)}>Status picture</button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="de-checkout-note" style={{ marginTop: 20 }}>
            {affiliate
              ? 'For Instagram and TikTok, use More… on your phone (it opens your apps) or Copy link, then paste it into your story, bio or message.'
              : 'For Instagram and TikTok, use More… on your phone or Copy link, then paste it where you want it.'}
          </p>
        </section>
      </main>
    </EliteLayout>
  );
}
