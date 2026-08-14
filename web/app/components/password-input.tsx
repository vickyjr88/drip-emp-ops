"use client";

/**
 * Password field with a reveal toggle.
 *
 * Typing a password blind is where sign-in failures actually come from -- a
 * caps-lock slip or a mistyped character is invisible until the request comes
 * back rejected -- so the field can be unmasked while it is being entered.
 *
 * The toggle starts masked and never persists its state: revealing is a
 * deliberate act for one field, and a page that remembered it could leave a
 * password on screen on the next visit.
 */

import { InputHTMLAttributes, useId, useState } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput(props: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const describedById = useId();

  return (
    <span className="lp-password-field">
      <input {...props} type={revealed ? 'text' : 'password'} />
      <button
        type="button"
        className="lp-password-toggle"
        onClick={() => setRevealed((current) => !current)}
        // The button sits inside the field's <label>, so a plain click would
        // also focus the input and move the caret. Stopping propagation keeps
        // the toggle from disturbing what is being typed.
        onMouseDown={(event) => event.preventDefault()}
        aria-pressed={revealed}
        aria-describedby={describedById}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        // Password managers otherwise try to fill this control.
        data-lpignore="true"
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
      {/* Announced on toggle so a screen-reader user knows the password is
          now visible on screen, which is a privacy matter, not just a state. */}
      <span id={describedById} className="lp-visually-hidden" aria-live="polite">
        {revealed ? 'Password is visible' : 'Password is hidden'}
      </span>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M1.7 10S4.6 4.8 10 4.8 18.3 10 18.3 10 15.4 15.2 10 15.2 1.7 10 1.7 10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M1.7 10S4.6 4.8 10 4.8c1.3 0 2.4.3 3.4.7M18.3 10s-2.9 5.2-8.3 5.2c-1.3 0-2.4-.3-3.4-.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 3l14 14" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
