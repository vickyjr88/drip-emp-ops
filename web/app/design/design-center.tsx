"use client";

/**
 * The design center: choose a shirt, put a name and number (or text and artwork) on it, swap the lettering, and see
 * the front and back as it will be printed.
 *
 * What is drawn here is only a preview. Saving sends the design to the server, which checks it against the rules for
 * that shirt, prices it itself and stores the cleaned copy; the cart keeps only the token for that saved design. The
 * total shown here is a courtesy, never what is charged.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KitShirt, areasFor, areasFromFractions, type DesignItem, type DesignSpec, type KitColors } from '../components/kit-shirt';
import { useCart } from '../lib/cart';
import { useEnquiryContact } from '../lib/use-enquiry-contact';
import { formatKes } from '../lib/shop';
import { trackAddToCart as trackMetaAddToCart } from '../lib/meta-pixel';
import { trackAddToCart as trackXAddToCart } from '../lib/x-pixel';
import { trackAddToCart as trackTikTokAddToCart } from '../lib/tiktok-pixel';
import {
  EDITION_LABELS, LEAGUES, type KitClub, type KitConfig, type KitProduct, type SavedDesign,
} from '../lib/kits';
import {
  MAX_NAME, contrastOn, isLight, nameProblem, numberProblem, printFeeOf, renderPreview, shade, summarise,
} from './design-utils';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

type Mode = 'JERSEY' | 'TSHIRT';
type Edition = 'HOME' | 'AWAY' | 'THIRD';

export type DesignInitial = {
  kit?: string;
  club?: string;
  edition?: string;
  design?: SavedDesign | null;
};

const apiError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return Array.isArray(data?.message) ? data.message[0] : data?.message || fallback;
  } catch {
    return fallback;
  }
};

export function DesignCenter({ config, clubs, kits, initial }: { config: KitConfig; clubs: KitClub[]; kits: KitProduct[]; initial: DesignInitial }) {
  const cart = useCart();
  const enquiry = useEnquiryContact();
  const frontRef = useRef<SVGSVGElement>(null);
  const backRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number; scale: number } | null>(null);

  // --- where the design starts: a kit, a club, a saved design, or the first club in the list ---------------------
  const startKit = initial.kit ? kits.find((k) => k.slug === initial.kit) : undefined;
  const savedSpec = initial.design?.spec;
  const startTemplate = savedSpec?.templateKey ?? startKit?.kit.templateKey;
  const startMode: Mode = startTemplate?.startsWith('tee') ? 'TSHIRT' : startKit?.kit.kind === 'TSHIRT' ? 'TSHIRT' : 'JERSEY';
  const startClub = startKit?.kit.club?.slug ?? initial.club ?? (clubs.find((c) => c.slug === 'arsenal') ?? clubs[0])?.slug ?? '';
  const startEdition: Edition = (['HOME', 'AWAY', 'THIRD'].includes(String(startKit?.kit.edition ?? initial.edition ?? '').toUpperCase())
    ? String(startKit?.kit.edition ?? initial.edition).toUpperCase()
    : 'HOME') as Edition;

  const [mode, setMode] = useState<Mode>(startMode);
  const [clubSlug, setClubSlug] = useState(startClub);
  const [edition, setEdition] = useState<Edition>(startEdition);
  // The shirts offered: the templates staff have not hidden, narrowed to those a shirt is actually set up on (so a shopper
  // is not offered a shape that cannot be ordered). If none is set up yet, all are shown so the design can still be tried.
  const offered = (kind: Mode) => {
    const all = config.templates.filter((t) => t.kind === kind);
    const withShirt = all.filter((t) => kits.some((k) => k.kit.templateKey === t.key));
    return withShirt.length ? withShirt : all;
  };
  const jerseyOptions = offered('JERSEY');
  const teeOptions = offered('TSHIRT');
  const [jerseyTemplate, setJerseyTemplate] = useState(startMode === 'JERSEY' && startTemplate ? startTemplate : jerseyOptions[0]?.key ?? 'jersey-short');
  const [teeTemplate, setTeeTemplate] = useState(startMode === 'TSHIRT' && startTemplate ? startTemplate : teeOptions[0]?.key ?? 'tee-crew');
  const startHex = (savedSpec?.colors.primary ?? startKit?.kit.colors.primary)?.toLowerCase();
  const [colourPick, setColourPick] = useState('');
  const [nameText, setNameText] = useState(savedSpec?.name?.text ?? '');
  const [numberText, setNumberText] = useState(savedSpec?.number?.value ?? '');
  const [fontKey, setFontKey] = useState<string>(savedSpec?.name?.fontKey ?? savedSpec?.number?.fontKey ?? '');
  const [textColour, setTextColour] = useState<string>(savedSpec?.name?.color ?? savedSpec?.number?.color ?? '');
  const [items, setItems] = useState<DesignItem[]>(savedSpec?.items ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [side, setSide] = useState<'front' | 'back'>(startMode === 'JERSEY' ? 'back' : 'front');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ token: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- the shirt being designed ----------------------------------------------------------------------------------
  const club = clubs.find((c) => c.slug === clubSlug);
  const templateKey = mode === 'JERSEY' ? jerseyTemplate : teeTemplate;
  // A template staff uploaded photos for: its colours replace the drawn shirt's, and its photos are what is shown.
  const customTpl = config.templates.find((t) => t.key === templateKey && t.custom && t.colours?.length) ?? null;
  const colourOptions: Array<{ key: string; label: string; hex: string; front?: string; back?: string }> = customTpl ? customTpl.colours! : config.teePalette;
  const colourChoice = colourOptions.find((c) => c.key === colourPick) ?? colourOptions.find((c) => c.hex.toLowerCase() === startHex) ?? colourOptions[0];
  const plainColours = (hex: string): KitColors => ({ primary: hex, secondary: hex, trim: shade(hex, isLight(hex) ? -0.18 : 0.14), pattern: 'solid', sleeves: 'primary' });
  const colours: KitColors = useMemo(() => {
    if (customTpl && colourChoice) return plainColours(colourChoice.hex);
    if (mode === 'JERSEY') return (club ? (edition === 'AWAY' ? club.away : edition === 'THIRD' ? club.third : club.home) : { primary: '#d9d9d6', secondary: '#111111', trim: '#111111', pattern: 'solid', sleeves: 'primary' }) as KitColors;
    return plainColours(colourChoice?.hex ?? '#f5f5f2');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, club, edition, customTpl, colourChoice?.hex]);
  const colorLabel = customTpl || mode === 'TSHIRT' ? colourChoice?.label : club ? `${club.name} ${EDITION_LABELS[edition].toLowerCase()}` : undefined;

  // The kit product that prices, stocks and ships this design: a ready-made shirt for this club and edition if there is
  // one, otherwise the generic custom jersey or T-shirt.
  const product = useMemo(() => {
    // Only a shirt made on the template being designed can take the order: the server refuses a design on a different one.
    const onTemplate = kits.filter((k) => k.kit.kind === mode && k.kit.templateKey === templateKey);
    if (mode === 'JERSEY') {
      return (
        onTemplate.find((k) => k.kit.club?.slug === clubSlug && k.kit.edition === edition) ??
        onTemplate.find((k) => !k.kit.club) ??
        null
      );
    }
    return onTemplate[0] ?? null;
  }, [kits, mode, clubSlug, edition, templateKey]);

  const allowName = product ? product.kit.allowName : mode === 'JERSEY';
  const allowNumber = product ? product.kit.allowNumber : mode === 'JERSEY';
  const allowArtwork = product ? product.kit.allowArtwork : mode === 'TSHIRT';

  useEffect(() => {
    const keep = product?.variants.find((v) => v.id === variantId);
    if (!keep) setVariantId(product?.variants.find((v) => v.size === 'M')?.id ?? product?.variants.find((v) => v.inStock)?.id ?? product?.variants[0]?.id ?? null);
  }, [product, variantId]);

  // Lettering: this club's suggestions first, then the rest.
  const fonts = useMemo(() => {
    const suggested = (club?.fontKeys ?? []).map((k) => config.fonts.find((f) => f.key === k)).filter(Boolean) as KitConfig['fonts'];
    const rest = config.fonts.filter((f) => !suggested.includes(f));
    return { suggested, rest };
  }, [club, config.fonts]);
  const activeFont = fontKey || fonts.suggested[0]?.key || config.fonts[0]?.key || 'condensed';
  const swatches = useMemo(() => Array.from(new Set(['#ffffff', '#111111', '#f5c518', colours.secondary, colours.primary].map((c) => c.toLowerCase()))), [colours]);
  const activeColour = textColour || contrastOn(colours.pattern === 'solid' || colours.pattern === 'pinstripe' ? colours.primary : colours.primary);

  // --- the design as data ------------------------------------------------------------------------------------------
  const nameErr = nameProblem(nameText);
  const numberErr = numberProblem(numberText);
  const nameOn = allowName && nameText.trim() !== '' && !nameErr;
  const numberOn = allowNumber && numberText.trim() !== '' && !numberErr;
  const spec: DesignSpec = {
    v: 1,
    templateKey,
    ...(product ? { productSlug: product.slug } : {}),
    colors: colours,
    ...(colorLabel ? { colorLabel } : {}),
    ...(nameOn ? { name: { text: nameText.replace(/\s+/g, ' ').trim().toUpperCase(), fontKey: activeFont, color: activeColour } } : {}),
    ...(numberOn ? { number: { value: String(Number(numberText.trim())), fontKey: activeFont, color: activeColour } } : {}),
    items: allowArtwork ? items : [],
  };
  const personalised = Boolean(spec.name || spec.number || spec.items.length);
  const fee = printFeeOf(spec, config.pricing);
  const variant = product?.variants.find((v) => v.id === variantId) ?? null;
  const unit = (variant?.priceKes ?? 0) + fee;
  // Photos: the uploaded template's (for the chosen colour), else the shirt's own. Print areas marked on a photo are
  // fractions of it, mapped through the photo's shape; a drawn shirt uses its own.
  const photoFront = customTpl ? colourChoice?.front ?? null : product?.kit.photoFront ?? null;
  const photoBack = customTpl ? colourChoice?.back ?? null : product?.kit.photoBack ?? null;
  const photoAspect = customTpl?.aspect ?? product?.kit.photoAspect ?? null;
  const fractionAreas = (customTpl?.areas ?? product?.kit.printAreas ?? null) as Record<string, { x: number; y: number; w: number; h: number }> | null;
  const areas = photoFront || photoBack ? areasFromFractions(fractionAreas, photoAspect, mode) : areasFor(templateKey);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const usedFonts = useMemo(
    () => Array.from(new Set([spec.name?.fontKey, spec.number?.fontKey, ...spec.items.map((i) => i.fontKey)].filter(Boolean) as string[])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(spec)],
  );

  function changeMode(next: Mode) {
    setMode(next);
    setSelectedId(null);
    setAdded(null);
    setSide(next === 'JERSEY' ? 'back' : 'front');
  }

  // --- items: text and artwork on a T-shirt ----------------------------------------------------------------------
  const patchItem = (id: string, patch: Partial<DesignItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const newId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function addText() {
    if (items.length >= 6) return setError('A design can have up to 6 items.');
    const item: DesignItem = { id: newId(), kind: 'text', side, text: 'YOUR TEXT', fontKey: activeFont, color: activeColour, x: 0.5, y: 0.5, scale: 0.7, rotation: 0 };
    setItems((list) => [...list, item]);
    setSelectedId(item.id);
    setError(null);
  }

  async function addArtwork(file: File) {
    if (items.length >= 6) return setError('A design can have up to 6 items.');
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API}/kits/artwork`, { method: 'POST', body });
      if (!response.ok) throw new Error(await apiError(response, 'That picture could not be added.'));
      const { url } = (await response.json()) as { url: string };
      const item: DesignItem = { id: newId(), kind: 'artwork', side, artworkUrl: url, x: 0.5, y: 0.5, scale: 0.7, rotation: 0 };
      setItems((list) => [...list, item]);
      setSelectedId(item.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // Dragging an item on the shirt: pointer movement is converted from screen pixels to the drawing's own units.
  function toDrawing(event: React.PointerEvent, svg: SVGSVGElement) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  function onItemPointerDown(id: string, event: React.PointerEvent<SVGElement>) {
    const svg = (side === 'front' ? frontRef : backRef).current;
    const item = items.find((i) => i.id === id);
    if (!svg || !item) return;
    const p = toDrawing(event, svg);
    if (!p) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    drag.current = { id, startX: p.x, startY: p.y, x: item.x, y: item.y, scale: item.scale };
    setSelectedId(id);
  }
  function onStageMove(event: React.PointerEvent) {
    const d = drag.current;
    const svg = (side === 'front' ? frontRef : backRef).current;
    if (!d || !svg) return;
    const p = toDrawing(event, svg);
    if (!p) return;
    const area = side === 'front' ? areas.frontCentre : areas.backNumber;
    patchItem(d.id, {
      x: Math.min(1, Math.max(0, d.x + (p.x - d.startX) / area.w)),
      y: Math.min(1, Math.max(0, d.y + (p.y - d.startY) / area.h)),
    });
  }
  const endDrag = () => { drag.current = null; };

  // --- adding to the cart ----------------------------------------------------------------------------------------
  const whatsappMessage = [
    'Hello Drip Emporium, I would like a custom shirt:',
    '',
    mode === 'JERSEY' ? `Shirt: ${club?.name ?? 'Jersey'} ${EDITION_LABELS[edition]} jersey` : `Shirt: ${config.templates.find((t) => t.key === templateKey)?.label ?? 'T-shirt'} (${colourChoice?.label ?? ''})`,
    ...(personalised ? [`Print: ${summarise(spec)}`] : []),
    ...(variant ? [`Size: ${variant.size ?? variant.name}`] : []),
  ].join('\n');

  async function addToCart() {
    if (!product || !variant) return;
    setBusy(true);
    setError(null);
    try {
      let token: string | null = null;
      let previewUrl: string | null = null;
      if (personalised) {
        const saved = await fetch(`${API}/kits/designs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productSlug: product.slug, spec }),
        });
        if (!saved.ok) throw new Error(await apiError(saved, 'This design could not be saved.'));
        token = ((await saved.json()) as { token: string }).token;

        // A picture of the finished shirt for the order. Best effort: the order does not depend on it.
        if (frontRef.current && backRef.current) {
          const blob = await renderPreview(frontRef.current, backRef.current, usedFonts);
          if (blob) {
            const body = new FormData();
            body.append('file', blob, 'preview.png');
            const response = await fetch(`${API}/kits/designs/${token}/preview`, { method: 'POST', body }).catch(() => null);
            if (response?.ok) previewUrl = ((await response.json()) as { previewUrl: string }).previewUrl;
          }
        }
      }

      cart.add(
        {
          id: token ? `${variant.id}:${token}` : variant.id,
          variantId: variant.id,
          productSlug: product.slug,
          name: product.name,
          size: variant.size ?? variant.name,
          sku: variant.sku,
          // The cart shows the total the server will charge: shirt plus print fee. Checkout recomputes it regardless.
          priceKes: unit,
          imageUrl: previewUrl ?? product.imageUrls[0] ?? null,
          path: token ? `/design/${token}` : `/kits/${product.slug}`,
          ...(token ? { designToken: token, designSummary: summarise(spec) } : {}),
        },
        quantity,
      );
      const track = { contentId: product.id, contentName: `${product.name} - ${variant.size ?? variant.name}`, value: unit };
      trackMetaAddToCart(track);
      trackXAddToCart(track);
      trackTikTokAddToCart(track);
      setAdded({ token });
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const problem = nameErr || numberErr;
  const canAdd = Boolean(product && variant) && !problem && !busy;
  const jerseyClubs = LEAGUES.map((league) => ({ league, list: clubs.filter((c) => c.league === league.key) })).filter((g) => g.list.length);

  return (
    <div className="lp-container dc">
      {/* ---------------------------------------------------------------- the shirt ---------------------------------- */}
      <div className="dc-stage" ref={stageRef} onPointerMove={onStageMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="dc-sides" role="tablist" aria-label="Side of the shirt">
          {(['front', 'back'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} className={side === s ? 'is-on' : ''} onClick={() => setSide(s)}>
              {s === 'front' ? 'Front' : 'Back'}
            </button>
          ))}
        </div>
        <div className="dc-canvas">
          {/* Both sides are always drawn (one hidden) so the finished preview can be taken of each. */}
          <div className={side === 'front' ? 'dc-view' : 'dc-view is-hidden'}>
            <KitShirt svgRef={frontRef} templateKey={templateKey} colors={colours} side="front" name={spec.name} number={spec.number} items={spec.items} areas={areas} photo={photoFront} photoAspect={photoAspect} selectedItemId={selectedId} onItemPointerDown={allowArtwork ? onItemPointerDown : undefined} title="Front of the shirt" />
          </div>
          <div className={side === 'back' ? 'dc-view' : 'dc-view is-hidden'}>
            <KitShirt svgRef={backRef} templateKey={templateKey} colors={colours} side="back" name={spec.name} number={spec.number} items={spec.items} areas={areas} photo={photoBack} photoAspect={photoAspect} selectedItemId={selectedId} onItemPointerDown={allowArtwork ? onItemPointerDown : undefined} title="Back of the shirt" />
          </div>
        </div>
        {mode === 'JERSEY' && side === 'back' && !spec.name && !spec.number ? <p className="dc-hint">Type a name or number to see it on the back.</p> : null}
        {allowArtwork && selected ? <p className="dc-hint">Drag it on the shirt, or use the controls.</p> : null}
      </div>

      {/* --------------------------------------------------------------- controls ------------------------------------ */}
      <div className="dc-panel">
        <section className="dc-step">
          <h2><span>1</span> Choose your shirt</h2>
          <div className="dc-toggle" role="group" aria-label="Type of shirt">
            <button type="button" className={mode === 'JERSEY' ? 'is-on' : ''} onClick={() => changeMode('JERSEY')}>Football jersey</button>
            <button type="button" className={mode === 'TSHIRT' ? 'is-on' : ''} onClick={() => changeMode('TSHIRT')}>T-shirt</button>
          </div>

          {mode === 'JERSEY' ? (
            <>
              <label className="dc-field">
                <span>Club or team</span>
                <select value={clubSlug} onChange={(e) => { setClubSlug(e.target.value); setFontKey(''); setTextColour(''); setAdded(null); }}>
                  {jerseyClubs.map(({ league, list }) => (
                    <optgroup key={league.key} label={league.name}>
                      {list.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              {customTpl ? null : (
                <div className="dc-chips" role="group" aria-label="Kit">
                  {(['HOME', 'AWAY', 'THIRD'] as Edition[]).map((e) => (
                    <button key={e} type="button" className={edition === e ? 'is-on' : ''} onClick={() => { setEdition(e); setTextColour(''); setAdded(null); }}>{EDITION_LABELS[e]}</button>
                  ))}
                </div>
              )}
              {jerseyOptions.length > 1 ? (
                <div className="dc-chips" role="group" aria-label="Style">
                  {jerseyOptions.map((t) => (
                    <button key={t.key} type="button" className={jerseyTemplate === t.key ? 'is-on' : ''} onClick={() => { setJerseyTemplate(t.key); setColourPick(''); setTextColour(''); setAdded(null); }}>{t.label}</button>
                  ))}
                </div>
              ) : null}
              {customTpl ? (
                <div className="dc-swatches" role="group" aria-label="Shirt colour">
                  {colourOptions.map((c) => (
                    <button key={c.key} type="button" className={colourChoice?.key === c.key ? 'is-on' : ''} style={{ background: c.hex }} onClick={() => { setColourPick(c.key); setTextColour(''); }} aria-label={c.label} title={c.label} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {teeOptions.length > 1 ? (
                <div className="dc-chips" role="group" aria-label="Style">
                  {teeOptions.map((t) => (
                    <button key={t.key} type="button" className={teeTemplate === t.key ? 'is-on' : ''} onClick={() => { setTeeTemplate(t.key); setColourPick(''); setTextColour(''); setAdded(null); }}>{t.label}</button>
                  ))}
                </div>
              ) : null}
              <div className="dc-swatches" role="group" aria-label="Shirt colour">
                {colourOptions.map((c) => (
                  <button key={c.key} type="button" className={colourChoice?.key === c.key ? 'is-on' : ''} style={{ background: c.hex }} onClick={() => { setColourPick(c.key); setTextColour(''); }} aria-label={c.label} title={c.label} />
                ))}
              </div>
            </>
          )}
          {!product ? (
            <p className="dc-warn">
              We have not set this shirt up for ordering yet.{' '}
              <a href={enquiry.whatsappHref(whatsappMessage)} target="_blank" rel="noreferrer" onClick={() => enquiry.onWhatsAppClick('design-center')}>Message us on WhatsApp</a> and we will make it for you.
            </p>
          ) : null}
        </section>

        {(allowName || allowNumber) ? (
          <section className="dc-step">
            <h2><span>2</span> Name and number</h2>
            <div className="dc-row">
              {allowName ? (
                <label className="dc-field">
                  <span>Name (back)</span>
                  <input value={nameText} maxLength={MAX_NAME + 4} onChange={(e) => { setNameText(e.target.value); setAdded(null); }} placeholder="e.g. SAKA" autoCapitalize="characters" aria-invalid={Boolean(nameErr)} />
                  {nameErr ? <small className="dc-err">{nameErr}</small> : <small>{nameText.trim().length}/{MAX_NAME}</small>}
                </label>
              ) : null}
              {allowNumber ? (
                <label className="dc-field dc-field-narrow">
                  <span>Number</span>
                  <input value={numberText} inputMode="numeric" maxLength={2} onChange={(e) => { setNumberText(e.target.value.replace(/\D/g, '')); setAdded(null); }} placeholder="7" aria-invalid={Boolean(numberErr)} />
                  {numberErr ? <small className="dc-err">{numberErr}</small> : <small>0 to 99</small>}
                </label>
              ) : null}
            </div>

            <div className="dc-label">Lettering style</div>
            <div className="dc-fonts" role="group" aria-label="Lettering style">
              {[...fonts.suggested, ...fonts.rest].map((f, index) => (
                <button key={f.key} type="button" className={activeFont === f.key ? 'is-on' : ''} onClick={() => { setFontKey(f.key); setAdded(null); }} title={f.label}>
                  <span style={{ fontFamily: `kit-${f.key}, Impact, sans-serif` }}>{(spec.name?.text || nameText || 'NAME').toUpperCase().slice(0, 10)} {numberText || '7'}</span>
                  <small>{f.label}{index < fonts.suggested.length && index === 0 ? ' · suggested' : ''}</small>
                </button>
              ))}
            </div>
            <div className="dc-label">Lettering colour</div>
            <div className="dc-swatches" role="group" aria-label="Lettering colour">
              {swatches.map((c) => (
                <button key={c} type="button" className={activeColour.toLowerCase() === c ? 'is-on' : ''} style={{ background: c }} onClick={() => { setTextColour(c); setAdded(null); }} aria-label={`Colour ${c}`} />
              ))}
            </div>
          </section>
        ) : null}

        {allowArtwork ? (
          <section className="dc-step">
            <h2><span>{allowName || allowNumber ? 3 : 2}</span> Your design</h2>
            <div className="dc-chips">
              <button type="button" onClick={addText}>+ Add text</button>
              <label className={`dc-upload${uploading ? ' is-busy' : ''}`}>
                {uploading ? 'Uploading…' : '+ Add a picture'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void addArtwork(file); }} />
              </label>
            </div>
            <p className="dc-help">Use a large, clear picture; it is printed as it appears here. PNG, JPEG, WebP or GIF, up to 8 MB.</p>
            {items.length ? (
              <ul className="dc-items">
                {items.map((item) => (
                  <li key={item.id} className={item.id === selectedId ? 'is-on' : ''}>
                    <button type="button" onClick={() => { setSelectedId(item.id); setSide(item.side); }}>{item.kind === 'text' ? `“${item.text}”` : 'Picture'} · {item.side}</button>
                    <button type="button" className="dc-remove" onClick={() => { setItems((l) => l.filter((i) => i.id !== item.id)); setSelectedId(null); }} aria-label="Remove">×</button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected ? (
              <div className="dc-editor">
                {selected.kind === 'text' ? (
                  <>
                    <label className="dc-field"><span>Text</span><input value={selected.text} maxLength={24} onChange={(e) => patchItem(selected.id, { text: e.target.value })} /></label>
                    <label className="dc-field"><span>Lettering</span>
                      <select value={selected.fontKey} onChange={(e) => patchItem(selected.id, { fontKey: e.target.value })}>{config.fonts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
                    </label>
                    <div className="dc-swatches" role="group" aria-label="Text colour">
                      {swatches.map((c) => <button key={c} type="button" className={selected.color === c ? 'is-on' : ''} style={{ background: c }} onClick={() => patchItem(selected.id, { color: c })} aria-label={`Colour ${c}`} />)}
                    </div>
                  </>
                ) : null}
                <div className="dc-chips" role="group" aria-label="Side">
                  {(['front', 'back'] as const).map((s) => <button key={s} type="button" className={selected.side === s ? 'is-on' : ''} onClick={() => { patchItem(selected.id, { side: s }); setSide(s); }}>{s === 'front' ? 'Front' : 'Back'}</button>)}
                </div>
                <label className="dc-slider"><span>Size</span><input type="range" min={0.1} max={1} step={0.01} value={selected.scale} onChange={(e) => patchItem(selected.id, { scale: Number(e.target.value) })} /></label>
                <label className="dc-slider"><span>Left / right</span><input type="range" min={0} max={1} step={0.01} value={selected.x} onChange={(e) => patchItem(selected.id, { x: Number(e.target.value) })} /></label>
                <label className="dc-slider"><span>Up / down</span><input type="range" min={0} max={1} step={0.01} value={selected.y} onChange={(e) => patchItem(selected.id, { y: Number(e.target.value) })} /></label>
                <label className="dc-slider"><span>Rotate</span><input type="range" min={-45} max={45} step={1} value={selected.rotation} onChange={(e) => patchItem(selected.id, { rotation: Number(e.target.value) })} /></label>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="dc-step">
          <h2><span>{allowArtwork ? ((allowName || allowNumber) ? 4 : 3) : (allowName || allowNumber) ? 3 : 2}</span> Size and price</h2>
          {!product ? <p className="dc-help">This shirt is not set up for online ordering yet. Send the design on WhatsApp and we will make it for you.</p> : null}
          {product ? (
            <>
              <div className="dc-chips" role="group" aria-label="Size">
                {product.variants.map((v) => (
                  <button key={v.id} type="button" className={variantId === v.id ? 'is-on' : ''} onClick={() => { setVariantId(v.id); setAdded(null); }} aria-label={`${v.size ?? v.name}${v.inStock ? '' : ', made to order'}`}>{v.size ?? v.name}</button>
                ))}
              </div>
              <dl className="dc-price">
                <div><dt>{product.name}</dt><dd>{variant ? formatKes(variant.priceKes) : ''}</dd></div>
                {personalised ? <div><dt>Printing ({summarise(spec)})</dt><dd>{formatKes(fee)}</dd></div> : null}
                <div className="is-total"><dt>Each</dt><dd>{variant ? formatKes(unit) : ''}</dd></div>
              </dl>
              <label className="dc-field dc-field-narrow"><span>Quantity</span>
                <input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
              </label>
            </>
          ) : null}

          {error ? <p className="dc-err" role="alert">{error}</p> : null}
          <div className="de-actions">
            <button type="button" className="lp-button lp-button-primary" disabled={!canAdd} onClick={() => void addToCart()}>
              {busy ? 'Saving your design…' : personalised ? `Add to cart · ${variant ? formatKes(unit * quantity) : ''}` : 'Add to cart'}
            </button>
            {added ? (
              <>
                <p className="dc-ok" role="status">Added to your cart ✓</p>
                <Link href="/cart" className="lp-button de-checkout-btn">Checkout ({cart.count} item{cart.count === 1 ? '' : 's'})</Link>
                {added.token ? <Link href={`/design/${added.token}`} className="lp-button lp-button-ghost">Open and share this design</Link> : null}
              </>
            ) : null}
            <a className="lp-button de-whatsapp" href={enquiry.whatsappHref(whatsappMessage)} onClick={() => enquiry.onWhatsAppClick('design-center')} target="_blank" rel="noreferrer">Send this design on WhatsApp</a>
          </div>
          <ul className="de-assurances">
            <li>{config.leadTime}</li>
            <li>{config.returnsNote}</li>
          </ul>
          <p className="kt-note">{config.fanVersionNote}</p>
        </section>
      </div>
    </div>
  );
}
