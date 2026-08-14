"use client";

/**
 * Portal notifications.
 *
 * Every screen used to keep its own `feedback` and `errorMessage` state and
 * render them as cards at the top of the stack. Two problems came of that: a
 * success and a failure looked much the same -- grey text either way, while
 * the reddish banner was actually the permissions notice -- and on a long form
 * the confirmation appeared above the fold, so saving from the bottom of the
 * page looked like nothing had happened.
 *
 * Notifications are now a fixed stack in the corner with a colour, an icon and
 * a word for each kind, so success and failure are distinguishable at a glance
 * and at a distance, and are never off-screen at the moment of the action.
 *
 * Colour is never the only signal: each kind carries its own icon and a text
 * label, so the four remain distinct in greyscale and for a colourblind
 * reader.
 */

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

type Notification = {
  id: number;
  kind: NotificationKind;
  message: string;
  /** Optional detail, e.g. the field-level reasons behind a validation failure. */
  detail?: string;
};

type NotifyOptions = { detail?: string; durationMs?: number };

type NotificationsContextValue = {
  notify: (kind: NotificationKind, message: string, options?: NotifyOptions) => void;
  success: (message: string, options?: NotifyOptions) => void;
  error: (message: string, options?: NotifyOptions) => void;
  warning: (message: string, options?: NotifyOptions) => void;
  info: (message: string, options?: NotifyOptions) => void;
  /** Reports a thrown value, unwrapping the API's error shape. */
  reportError: (error: unknown, fallback?: string) => void;
  dismiss: (id: number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Errors persist until dismissed; the rest clear themselves. */
const DEFAULT_DURATION: Record<NotificationKind, number> = {
  success: 4000,
  info: 5000,
  warning: 8000,
  error: 0,
};

const KIND_LABEL: Record<NotificationKind, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/**
 * Turns whatever was thrown into something worth reading.
 *
 * apiRequest rejects with the raw response body, which for a validation
 * failure is a JSON envelope carrying an array of messages. Showing that
 * verbatim puts `{"message":["name should not be empty"],...}` in front of the
 * operator, so the envelope is unwrapped here and the reasons are kept as
 * detail rather than being lost.
 */
export function describeError(error: unknown, fallback = 'Something went wrong.'): {
  message: string;
  detail?: string;
} {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw.trim()) return { message: fallback };

  try {
    const parsed = JSON.parse(raw);
    const body = parsed?.message ?? parsed?.error;

    if (Array.isArray(body)) {
      // One reason reads as the message; several are summarised and listed.
      if (body.length === 1) return { message: String(body[0]) };
      return {
        message: `${body.length} fields need attention.`,
        detail: body.map((item: unknown) => String(item)).join('\n'),
      };
    }

    if (typeof body === 'string' && body.trim()) {
      // "Unauthorized" and "Forbidden" are accurate but tell an operator
      // nothing about what to do next.
      if (parsed?.statusCode === 401) {
        return { message: 'Your session has expired. Sign in again to continue.' };
      }
      if (parsed?.statusCode === 403) {
        return { message: 'You do not have permission to do that.' };
      }
      return { message: body };
    }
  } catch {
    // Not JSON: a network failure or a plain-text body, both fine as-is.
  }

  return { message: raw };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (kind: NotificationKind, message: string, options?: NotifyOptions) => {
      if (!message?.trim()) return;
      const id = nextId.current++;
      setItems((prev) => {
        // Repeating an action should not stack identical copies; the newest
        // replaces the old so the count stays honest.
        const withoutDuplicate = prev.filter(
          (item) => !(item.kind === kind && item.message === message),
        );
        return [...withoutDuplicate, { id, kind, message, detail: options?.detail }];
      });

      const duration = options?.durationMs ?? DEFAULT_DURATION[kind];
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  // Clears pending timers if the provider unmounts mid-countdown.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notify,
      success: (message, options) => notify('success', message, options),
      error: (message, options) => notify('error', message, options),
      warning: (message, options) => notify('warning', message, options),
      info: (message, options) => notify('info', message, options),
      reportError: (error, fallback) => {
        const described = describeError(error, fallback);
        notify('error', described.message, { detail: described.detail });
      },
      dismiss,
    }),
    [notify, dismiss],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="portal-toasts" role="region" aria-label="Notifications">
        {items.map((item) => (
          <div
            key={item.id}
            className={`portal-toast is-${item.kind}`}
            // Errors and warnings interrupt; a save confirmation should not
            // cut off whatever the screen reader is already saying.
            role={item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status'}
            aria-live={item.kind === 'error' || item.kind === 'warning' ? 'assertive' : 'polite'}
          >
            <span className="portal-toast-icon" aria-hidden="true">
              <ToastIcon kind={item.kind} />
            </span>
            <div className="portal-toast-body">
              <p className="portal-toast-label">{KIND_LABEL[item.kind]}</p>
              <p className="portal-toast-message">{item.message}</p>
              {item.detail ? <pre className="portal-toast-detail">{item.detail}</pre> : null}
            </div>
            <button
              type="button"
              className="portal-toast-close"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

function ToastIcon({ kind }: { kind: NotificationKind }) {
  if (kind === 'success') {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <path d="M4 10.5l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === 'warning') {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <path d="M10 3l8 14H2z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 8v4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="10" cy="14.6" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" width="18" height="18">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="6.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}

/**
 * Drop-in replacements for the per-screen `feedback` / `errorMessage` state.
 *
 * Each keeps the `[value, setValue]` shape the screens already use, so the
 * call sites do not change, but setting a value also raises a notification.
 * The value is still returned because a handful of screens render it inline
 * for a page-level fallback -- "Project not found" belongs in the page, not
 * in a toast that disappears.
 *
 * Passing an Error rather than a string routes it through describeError, so
 * a screen can hand over whatever it caught.
 */
export function useErrorState(): [string | null, (value: unknown) => void] {
  const { reportError, dismiss } = useNotifications();
  const [value, setValue] = useState<string | null>(null);

  const set = useCallback(
    (next: unknown) => {
      if (next === null || next === undefined || next === '') {
        setValue(null);
        return;
      }
      const described = describeError(next);
      setValue(described.message);
      reportError(next);
    },
    [reportError],
  );

  // dismiss is referenced so the hook keeps a stable dependency on the
  // provider; without it a provider swap would leave a stale reporter.
  void dismiss;

  return [value, set];
}

export function useFeedbackState(): [string | null, (value: string | null) => void] {
  const { success } = useNotifications();
  const [value, setValue] = useState<string | null>(null);

  const set = useCallback(
    (next: string | null) => {
      setValue(next ?? null);
      if (next) success(next);
    },
    [success],
  );

  return [value, set];
}
