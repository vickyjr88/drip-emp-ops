"use client";

/**
 * Warns before someone loses what they typed.
 *
 * The browser's own warning only covers closing or reloading the tab. Following a link inside the portal (the menu, "Cancel", a row) just
 * replaces the page, and a half-typed product or customer is gone. While a form is dirty this also stops those link clicks and asks first,
 * using the portal's own dialog.
 *
 * Use it two ways:
 *  - uncontrolled: spread `formProps` on the <form> (any typing marks it dirty) and call `markClean()` after a successful save or Cancel;
 *  - controlled: pass `useUnsavedGuard(someBoolean)` when the page already knows whether there is unsaved work.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalDialog } from './portal-dialog';

export function useUnsavedGuard(controlled?: boolean) {
  const [touched, setTouched] = useState(false);
  const dirty = controlled ?? touched;
  const router = useRouter();
  const dialog = usePortalDialog();

  const markDirty = useCallback(() => setTouched(true), []);
  const markClean = useCallback(() => setTouched(false), []);

  // Closing or reloading the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Following a link inside the portal. Capture phase, so it runs before the link's own handler.
  useEffect(() => {
    if (!dirty) return;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void dialog.confirm({
        title: 'Leave without saving?',
        message: 'What you have typed on this page has not been saved and will be lost.',
        confirmLabel: 'Leave page',
        cancelLabel: 'Stay and keep editing',
        danger: true,
      }).then((leave) => {
        if (leave) { setTouched(false); router.push(`${url.pathname}${url.search}${url.hash}`); }
      });
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, dialog, router]);

  return { dirty, markDirty, markClean, formProps: { onInput: markDirty } };
}
