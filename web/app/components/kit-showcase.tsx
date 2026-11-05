'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Home colourways from the kit catalogue, worn by models. The shirts stay plain on purpose: fan-version
 * colour only, with no crest, sponsor or maker's mark, the same rule as the drawn shirts.
 */
const SLIDES: Array<{
  slug: string;
  name: string;
  short: string;
  league: string;
  leagueHref: string;
  colourway: string;
  swatch: string;
  src: string;
  alt: string;
}> = [
  {
    slug: 'harambee-stars',
    name: 'Harambee Stars',
    short: 'Harambee Stars',
    league: 'Kenyan Teams',
    leagueHref: '/kits/league/kenyan-teams',
    colourway: 'Crimson, black collar, green side stripe',
    swatch: '#bb0000',
    src: '/images/kits/harambee-stars.jpg',
    alt: 'Model on a floodlit pitch in a plain crimson jersey with a black collar, black cuffs and a green side stripe, and white shorts.',
  },
  {
    slug: 'gor-mahia',
    name: 'Gor Mahia',
    short: 'Gor Mahia',
    league: 'Kenyan Teams',
    leagueHref: '/kits/league/kenyan-teams',
    colourway: 'Green, white collar',
    swatch: '#008000',
    src: '/images/kits/gor-mahia.jpg',
    alt: 'Model on a night pitch in a plain green jersey with a white collar and white shorts, holding a football.',
  },
  {
    slug: 'afc-leopards',
    name: 'AFC Leopards',
    short: 'AFC Leopards',
    league: 'Kenyan Teams',
    leagueHref: '/kits/league/kenyan-teams',
    colourway: 'Royal blue, white collar',
    swatch: '#0033a0',
    src: '/images/kits/afc-leopards.jpg',
    alt: 'Model on a touchline in a plain royal-blue jersey with a white collar and white shorts.',
  },
  {
    slug: 'arsenal',
    name: 'Arsenal',
    short: 'Arsenal',
    league: 'Premier League',
    leagueHref: '/kits/league/premier-league',
    colourway: 'Red body, white sleeves',
    swatch: '#ef0107',
    src: '/images/kits/arsenal.jpg',
    alt: 'Model on a night pitch in a plain red jersey with white sleeves and a white collar, and white shorts.',
  },
  {
    slug: 'manchester-united',
    name: 'Manchester United',
    short: 'Manchester United',
    league: 'Premier League',
    leagueHref: '/kits/league/premier-league',
    colourway: 'Red, white collar',
    swatch: '#da291c',
    src: '/images/kits/manchester-united.jpg',
    alt: 'Model in a stadium wearing a plain red jersey with a white collar and white shorts, holding a football.',
  },
  {
    slug: 'manchester-city',
    name: 'Manchester City',
    short: 'Manchester City',
    league: 'Premier League',
    leagueHref: '/kits/league/premier-league',
    colourway: 'Sky blue, white collar',
    swatch: '#6cabdd',
    src: '/images/kits/manchester-city.jpg',
    alt: 'Model on a night pitch in a plain sky-blue jersey with a white collar and white shorts, a football at her feet.',
  },
  {
    slug: 'barcelona',
    name: 'Barcelona',
    short: 'Barcelona',
    league: 'La Liga',
    leagueHref: '/kits/league/la-liga',
    colourway: 'Garnet and blue stripes',
    swatch: '#a50044',
    src: '/images/kits/barcelona.jpg',
    alt: 'Model on a floodlit pitch in a plain jersey with vertical garnet and navy stripes, and navy shorts.',
  },
  {
    slug: 'real-madrid',
    name: 'Real Madrid',
    short: 'Real Madrid',
    league: 'La Liga',
    leagueHref: '/kits/league/la-liga',
    colourway: 'White, gold collar',
    swatch: '#f4efe4',
    src: '/images/kits/real-madrid.jpg',
    alt: 'Model in daylight on a pitch in a plain white jersey with a gold collar and gold cuffs, and white shorts.',
  },
];

const designHref = (slug: string) => `/design?${new URLSearchParams({ club: slug, edition: 'home' })}`;

export function KitShowcase({
  fanVersionNote,
  activeClubSlugs,
}: {
  fanVersionNote: string;
  /** Clubs switched on in the portal. A slide only deep-links once that page exists. */
  activeClubSlugs: string[];
}) {
  const active = new Set(activeClubSlugs);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const dragX = useRef<number | null>(null);
  const count = SLIDES.length;
  const slide = SLIDES[index];

  const choose = useCallback((next: number) => {
    setIndex((next + count) % count);
    setTick((n) => n + 1);
  }, [count]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || userPaused || hoverPaused) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), 6500);
    return () => window.clearInterval(id);
  }, [userPaused, hoverPaused, tick, count]);

  const jump = (next: number) => {
    choose(next);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('kit-showcase')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      choose(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      choose(index - 1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    dragX.current = event.clientX;
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragX.current == null) return;
    const dx = event.clientX - dragX.current;
    dragX.current = null;
    if ((event.target as HTMLElement).closest('a, button')) return;
    if (dx > 56) choose(index - 1);
    else if (dx < -56) choose(index + 1);
  };

  return (
    <>
      <section
        id="kit-showcase"
        className="kt-showcase"
        aria-roledescription="carousel"
        aria-label="Jersey colourways"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
      >
        <div className="kt-showcase-frame">
          {SLIDES.map((item, i) => (
            <figure
              key={item.slug}
              id={`kit-slide-${item.slug}`}
              className={`kt-showcase-slide${i === index ? ' is-on' : ''}`}
              role="tabpanel"
              aria-labelledby={`kit-tab-${item.slug}`}
              aria-hidden={i !== index}
            >
              <img
                src={item.src}
                alt={item.alt}
                width={1248}
                height={832}
                fetchPriority={i === 0 ? 'high' : 'low'}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </figure>
          ))}
          <div className="kt-showcase-shade" aria-hidden="true" />
        </div>

        <button type="button" className="kt-showcase-arrow is-prev" aria-label="Previous jersey" onClick={() => choose(index - 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
        <button type="button" className="kt-showcase-arrow is-next" aria-label="Next jersey" onClick={() => choose(index + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </button>

        <div className="kt-showcase-ui">
          <div className="lp-container kt-showcase-copy">
            <Link href={slide.leagueHref} className="kt-showcase-kicker">{slide.league}</Link>
            <p className="kt-showcase-club">{slide.name}</p>
            <p className="kt-showcase-line">{slide.colourway}. Home colourway.</p>
            <div className="kt-hero-actions">
              {active.has(slide.slug) ? (
                <>
                  <Link href={designHref(slide.slug)} className="lp-button lp-button-primary">Design this shirt</Link>
                  <Link href={`/kits/club/${slide.slug}`} className="lp-button lp-button-outline-light">{slide.short}</Link>
                </>
              ) : (
                <Link href="/design" className="lp-button lp-button-primary">Design your own</Link>
              )}
            </div>
          </div>
          <div className="lp-container kt-showcase-bar">
            <div className="kt-showcase-tabs" role="tablist" aria-label="Choose a jersey">
              {SLIDES.map((item, i) => (
                <button
                  key={item.slug}
                  type="button"
                  role="tab"
                  id={`kit-tab-${item.slug}`}
                  aria-label={item.short}
                  aria-selected={i === index}
                  aria-controls={`kit-slide-${item.slug}`}
                  tabIndex={i === index ? 0 : -1}
                  onClick={() => choose(i)}
                >
                  <span className="kt-showcase-tab-label">{item.short}</span>
                </button>
              ))}
            </div>
            <p className="kt-showcase-count" aria-hidden="true">{index + 1} / {count}</p>
            <button
              type="button"
              className="kt-showcase-pause"
              aria-pressed={userPaused}
              onClick={() => setUserPaused((paused) => !paused)}
            >
              {userPaused ? 'Play' : 'Pause'}
            </button>
          </div>
        </div>
      </section>

      <section className="lp-container kt-credits" aria-labelledby="kit-photo-credit">
        <h2 id="kit-photo-credit">Photo credit</h2>
        <p>
          The pictures above were made for Drip Emporium to show jersey colourways we sell.
          The people are models. They are not players of these clubs.
        </p>
        <p className="kt-note">{fanVersionNote}</p>
        <ol>
          {SLIDES.map((item, i) => (
            <li key={item.slug}>
              <button type="button" onClick={() => jump(i)}>
                <span className="kt-credits-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                {item.name}
              </button>
              <small>{item.colourway}. Image made for Drip Emporium.</small>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
