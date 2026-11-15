/**
 * Five stars, filled to a rating (halves and tenths included). Drawn inline so they need no icon font, and read aloud as "4.3 out of 5 stars".
 */

const STAR = 'M12 2.5l2.9 6.3 6.8.8-5 4.7 1.3 6.8L12 17.7 6 21.1l1.3-6.8-5-4.7 6.8-.8L12 2.5z';

export function Stars({ value, size = 18, label }: { value: number; size?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span className="de-stars" role="img" aria-label={label ?? `${clamped} out of 5 stars`} style={{ width: size * 5, height: size }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        const id = `star-${i}-${Math.round(fill * 100)}`;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={id}><stop offset={`${fill * 100}%`} stopColor="currentColor" /><stop offset={`${fill * 100}%`} stopColor="transparent" /></linearGradient>
            </defs>
            <path d={STAR} fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        );
      })}
    </span>
  );
}

/** Pick a rating: five stars that are a radio group, so it works by touch, by mouse and from the keyboard. */
export function StarPicker({ value, onChange, name }: { value: number; onChange: (rating: number) => void; name: string }) {
  return (
    <div className="de-star-picker" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? 'is-on' : undefined} title={`${n} star${n === 1 ? '' : 's'}`}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={STAR} fill={n <= value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="lp-visually-hidden">{n} star{n === 1 ? '' : 's'}</span>
        </label>
      ))}
    </div>
  );
}
