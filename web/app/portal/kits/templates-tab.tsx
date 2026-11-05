"use client";

/**
 * Shirt templates: what the design center draws the customer's design on. The drawn shirts that come with the site are
 * generic; here staff hide the ones that do not match what is sold and upload their own: a photo of the front and back in
 * each colour, with the print areas marked on the photo.
 */

import { useState } from 'react';
import { ImagePicker } from '../components/image-picker';
import { apiRequest } from '../accounting/lib';
import { AreaEditor, type Area } from './area-editor';

type BuiltIn = { key: string; label: string; kind: 'JERSEY' | 'TSHIRT'; hidden: boolean; kitCount: number };
type Colour = { key?: string; label: string; hex: string; front: string; back: string };
type Custom = {
  id: string; key: string; name: string; kind: 'JERSEY' | 'TSHIRT'; isActive: boolean; aspect: number;
  areas: Record<string, Area>; colours: Required<Colour>[]; kitCount: number;
};
export type TemplatesData = { builtIn: BuiltIn[]; custom: Custom[] };

const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const AREA_LABELS = (kind: 'JERSEY' | 'TSHIRT'): Array<{ key: string; label: string; side: 'front' | 'back'; help: string }> =>
  kind === 'TSHIRT'
    ? [
        { key: 'frontCentre', label: 'Front print area', side: 'front', help: 'Where text and pictures can go on the front.' },
        { key: 'backNumber', label: 'Back print area', side: 'back', help: 'Where text and pictures can go on the back.' },
      ]
    : [
        { key: 'backName', label: 'Name area', side: 'back', help: 'Where the name is printed, across the shoulders.' },
        { key: 'backNumber', label: 'Number area', side: 'back', help: 'Where the number is printed, below the name.' },
      ];
const DEFAULT_AREAS: Record<string, Area> = {
  frontCentre: { x: 0.3, y: 0.28, w: 0.4, h: 0.4 },
  backName: { x: 0.28, y: 0.14, w: 0.44, h: 0.1 },
  backNumber: { x: 0.3, y: 0.28, w: 0.4, h: 0.4 },
};

export function TemplatesTab({ token, data, onChanged, setError, setFeedback }: {
  token: string; data: TemplatesData | null; onChanged: () => void;
  setError: (e: unknown) => void; setFeedback: (m: string) => void;
}) {
  const [editing, setEditing] = useState<Custom | 'new' | null>(null);

  async function hide(key: string, hidden: boolean) {
    try { await apiRequest(`/kits/admin/templates/builtin/${key}`, { method: 'PUT', body: JSON.stringify({ hidden }) }, token); onChanged(); } catch (e) { setError(e); }
  }
  async function toggle(t: Custom) {
    try { await apiRequest(`/kits/admin/templates/${t.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !t.isActive }) }, token); onChanged(); } catch (e) { setError(e); }
  }
  async function remove(t: Custom) {
    if (!window.confirm(`Delete the template "${t.name}"? This cannot be undone.`)) return;
    try { await apiRequest(`/kits/admin/templates/${t.id}`, { method: 'DELETE' }, token); setFeedback('Template deleted.'); onChanged(); } catch (e) { setError(e); }
  }

  if (editing) {
    return <TemplateForm token={token} template={editing === 'new' ? null : editing} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} setError={setError} setFeedback={setFeedback} />;
  }

  return (
    <>
      <article className="portal-card">
        <div className="portal-card-header-row">
          <div>
            <h2 style={{ margin: 0 }}>Your shirt templates</h2>
            <p className="portal-muted" style={{ margin: '4px 0 0', maxWidth: '64ch' }}>
              Upload a photo of the front and back of the shirt you sell, in each colour, and mark where the print goes. The design center then shows
              customers their design on your actual shirt.
            </p>
          </div>
          <button type="button" className="portal-primary-btn" onClick={() => setEditing('new')}>New template</button>
        </div>
        {!data || data.custom.length === 0 ? <div className="portal-empty-state">No templates of your own yet. The drawn shirts below are being used.</div> : (
          <div className="kp-templates">
            {data.custom.map((t) => (
              <div key={t.id} className={`kp-template${t.isActive ? '' : ' is-off'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.colours[0]?.front} alt="" />
                <div>
                  <h3>{t.name}</h3>
                  <p className="portal-muted">{t.kind === 'JERSEY' ? 'Jersey' : 'T-shirt'} · {t.colours.map((c) => c.label).join(', ')} · {t.kitCount} shirt{t.kitCount === 1 ? '' : 's'} use it</p>
                  <div className="portal-action-row">
                    <button type="button" className="portal-ghost-btn" onClick={() => setEditing(t)}>Edit</button>
                    <label className="kp-inline"><input type="checkbox" checked={t.isActive} onChange={() => void toggle(t)} />Shown in the design center</label>
                    <button type="button" className="portal-ghost-btn" onClick={() => void remove(t)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="portal-card">
        <h2 style={{ marginTop: 0 }}>Drawn shirts that come with the site</h2>
        <p className="portal-muted" style={{ maxWidth: '64ch' }}>These are generic drawings. If they do not look like what you sell, hide them. Hidden shirts disappear from the design center; shirts already ordered on them are not affected.</p>
        <div className="kp-clubs">
          {(data?.builtIn ?? []).map((t) => (
            <label key={t.key} className={t.hidden ? 'is-off' : ''}>
              <input type="checkbox" checked={!t.hidden} onChange={(e) => void hide(t.key, !e.target.checked)} />
              <span>{t.label}</span>
              <small>{t.kind === 'JERSEY' ? 'Jersey' : 'T-shirt'}{t.kitCount ? ` · ${t.kitCount} shirt${t.kitCount === 1 ? '' : 's'}` : ''}</small>
            </label>
          ))}
        </div>
      </article>
    </>
  );
}

function TemplateForm({ token, template, onDone, onCancel, setError, setFeedback }: {
  token: string; template: Custom | null; onDone: () => void; onCancel: () => void;
  setError: (e: unknown) => void; setFeedback: (m: string) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [kind, setKind] = useState<'JERSEY' | 'TSHIRT'>(template?.kind ?? 'TSHIRT');
  const [colours, setColours] = useState<Colour[]>(template?.colours ?? [{ label: '', hex: '#1b2a49', front: '', back: '' }]);
  const [areas, setAreas] = useState<Record<string, Area>>(template?.areas ?? {});
  const [aspect, setAspect] = useState<number>(template?.aspect ?? 1);
  const [picking, setPicking] = useState<{ index: number; side: 'front' | 'back' } | null>(null);
  const [areaKey, setAreaKey] = useState<string>(AREA_LABELS(template?.kind ?? 'TSHIRT')[0].key);
  const [sell, setSell] = useState(!template);
  const [price, setPrice] = useState('1500');
  const [sizes, setSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [dropShip, setDropShip] = useState(true);
  const [saving, setSaving] = useState(false);

  const slots = AREA_LABELS(kind);
  const slot = slots.find((s) => s.key === areaKey) ?? slots[0];
  const first = colours[0];
  const previewImage = slot.side === 'front' ? first?.front : first?.back;
  const current = areas[slot.key] ?? null;

  const patch = (i: number, p: Partial<Colour>) => setColours((list) => list.map((c, idx) => (idx === i ? { ...c, ...p } : c)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const filled: Record<string, Area> = {};
      for (const s of slots) filled[s.key] = areas[s.key] ?? DEFAULT_AREAS[s.key];
      const body = { name, aspect, areas: filled, colours: colours.map((c) => ({ label: c.label, hex: c.hex, front: c.front, back: c.back, ...(c.key ? { key: c.key } : {}) })) };
      if (template) {
        await apiRequest(`/kits/admin/templates/${template.id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      } else {
        await apiRequest('/kits/admin/templates', {
          method: 'POST',
          body: JSON.stringify({ ...body, kind, ...(sell ? { product: { priceKes: Number(price), sizes, isDropShip: dropShip } } : {}) }),
        }, token);
      }
      setFeedback(template ? 'Template saved.' : sell ? 'Template created, with a shirt to sell on it.' : 'Template created.');
      onDone();
    } catch (error) { setError(error); } finally { setSaving(false); }
  }

  return (
    <article className="portal-card">
      <h2 style={{ marginTop: 0 }}>{template ? `Edit ${template.name}` : 'New shirt template'}</h2>
      <form onSubmit={save} className="kp-form" style={{ maxWidth: 820 }}>
        <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Boxy tee" /></label>
        {!template ? (
          <label>Type<select value={kind} onChange={(e) => { const k = e.target.value as 'JERSEY' | 'TSHIRT'; setKind(k); setAreaKey(AREA_LABELS(k)[0].key); setAreas({}); }}>
            <option value="TSHIRT">T-shirt</option><option value="JERSEY">Football jersey</option>
          </select></label>
        ) : null}

        <fieldset>
          <legend>Colours and photos</legend>
          <p className="portal-muted" style={{ margin: '0 0 8px' }}>One entry for each colour you sell. Use photos on a plain background, front and back at the same angle and size.</p>
          {colours.map((c, i) => (
            <div key={i} className="kp-colour">
              <input aria-label="Colour name" placeholder="Navy" value={c.label} onChange={(e) => patch(i, { label: e.target.value })} />
              <input aria-label="Colour" type="color" value={c.hex} onChange={(e) => patch(i, { hex: e.target.value })} />
              {(['front', 'back'] as const).map((side) => (
                <button key={side} type="button" className="kp-photo" onClick={() => setPicking({ index: i, side })}>
                  {c[side] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c[side]} alt={`${side} photo`} /> : <span>Choose {side} photo</span>}
                </button>
              ))}
              {colours.length > 1 ? <button type="button" className="portal-ghost-btn" onClick={() => setColours((l) => l.filter((_, idx) => idx !== i))}>Remove</button> : null}
            </div>
          ))}
          <button type="button" className="portal-ghost-btn" onClick={() => setColours((l) => [...l, { label: '', hex: '#161616', front: '', back: '' }])}>Add a colour</button>
        </fieldset>

        <fieldset>
          <legend>Print areas</legend>
          <p className="portal-muted" style={{ margin: '0 0 8px' }}>Drag the box to where the print goes on the photo, and resize it by its corners. It is the same for every colour.</p>
          <div className="dc-chips" role="group" aria-label="Which area">
            {slots.map((s) => <button key={s.key} type="button" className={s.key === slot.key ? 'is-on' : ''} onClick={() => setAreaKey(s.key)}>{s.label}</button>)}
          </div>
          {previewImage ? (
            <AreaEditor
              image={previewImage}
              label={slot.help}
              area={current ?? DEFAULT_AREAS[slot.key]}
              onChange={(a) => setAreas((m) => ({ ...m, [slot.key]: a }))}
              onAspect={(a) => { if (slot.side === 'front') setAspect(Math.round(a * 1000) / 1000); }}
            />
          ) : <div className="portal-empty-state">Choose the {slot.side} photo of the first colour above to mark this area on it.</div>}
        </fieldset>

        {!template ? (
          <fieldset>
            <legend>Selling it</legend>
            <label className="kp-inline"><input type="checkbox" checked={sell} onChange={(e) => setSell(e.target.checked)} />Also create the shirt customers order on this template</label>
            {sell ? (
              <>
                <label>Price per shirt, before printing (KES)<input type="number" min={0} required value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                <div>{ALL_SIZES.map((s) => <label key={s} className="kp-inline"><input type="checkbox" checked={sizes.includes(s)} onChange={(e) => setSizes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} />{s}</label>)}</div>
                <label className="kp-inline"><input type="checkbox" checked={dropShip} onChange={(e) => setDropShip(e.target.checked)} />Sourced from the supplier for each order (untick if you hold stock)</label>
              </>
            ) : <p className="portal-muted">You can add the shirt later under Kits.</p>}
          </fieldset>
        ) : null}

        <div className="portal-action-row">
          <button type="submit" className="portal-primary-btn" disabled={saving || !name || colours.some((c) => !c.label || !c.front || !c.back) || (!template && sell && sizes.length === 0)}>{saving ? 'Saving…' : template ? 'Save template' : 'Create template'}</button>
          <button type="button" className="portal-ghost-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
      <ImagePicker
        open={picking !== null}
        token={token}
        title={picking ? `Choose the ${picking.side} photo` : 'Choose a photo'}
        allowCrop
        onClose={() => setPicking(null)}
        onSelect={(urls) => { if (picking && urls[0]) patch(picking.index, { [picking.side]: urls[0] }); setPicking(null); }}
      />
    </article>
  );
}
