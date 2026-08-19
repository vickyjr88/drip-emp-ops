"use client";

/**
 * "Choose an existing image" picker.
 *
 * Every image uploader in the portal pairs with one of these, so the same
 * photograph can be reused across a project, its blocks, its floor plans and
 * its units instead of being uploaded again for each. Re-uploading is what
 * happens without it, and that leaves the bucket holding several byte-identical
 * copies of the same building that then have to be kept in step by hand.
 *
 * Selection returns URLs, matching what uploadMedia hands back, so a caller can
 * treat "uploaded" and "picked" as the same event and needs no second code path.
 */

import { useCallback, useEffect, useState } from 'react';
import { useErrorState } from '../components/notifications';
import { apiRequest } from '../accounting/lib';

type LibraryImage = {
  objectKey: string;
  url: string;
  sizeBytes: number;
  uploadedAt: string;
};

type LibraryResponse = {
  items: LibraryImage[];
  nextCursor: string | null;
  total: number;
};

type ImagePickerProps = {
  open: boolean;
  token: string | null;
  onClose: () => void;
  /** Receives the chosen image URLs, newest-first order preserved. */
  onSelect: (urls: string[]) => void;
  /**
   * Receives the full library entries instead, for callers that must persist
   * the object key as well as the URL.
   */
  onSelectItems?: (items: LibraryImage[]) => void;
  /** Allow picking several at once, for gallery fields. */
  multiple?: boolean;
  /** Already-used URLs, marked so the same image is not added twice. */
  usedUrls?: string[];
  title?: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compares a stored URL with a library URL.
 *
 * Stored values were written by whichever host the API answered on at the
 * time, so a saved "http://localhost:3100/media/x.jpg" and a freshly listed
 * one can differ by origin while naming the same object. The object key is the
 * part that actually identifies the image.
 */
function objectKeyOf(url: string): string {
  const match = /\/media\/([^/?#]+)/.exec(url || '');
  return match ? match[1] : url;
}

export function ImagePicker({
  open,
  token,
  onClose,
  onSelect,
  onSelectItems,
  multiple = false,
  usedUrls = [],
  title = 'Choose an image',
}: ImagePickerProps) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [chosen, setChosen] = useState<string[]>([]);

  const safeUsedUrls = Array.isArray(usedUrls) ? usedUrls : [];
  const used = new Set(safeUsedUrls.filter(Boolean).map(objectKeyOf));

  const loadPage = useCallback(
    async (nextCursor?: string) => {
      if (!token) return;
      setLoading(true);
      setErrorMessage(null);
      try {
        const query = nextCursor ? `?limit=60&cursor=${encodeURIComponent(nextCursor)}` : '?limit=60';
        const data = await apiRequest<LibraryResponse>(`/media/library${query}`, { method: 'GET' }, token);
        const nextItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? (data as unknown as LibraryImage[]) : [];
        setImages((prev) => (nextCursor ? [...(Array.isArray(prev) ? prev : []), ...nextItems] : nextItems));
        setCursor(data?.nextCursor || null);
        setTotal(data?.total || 0);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load the image library.');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  // Loaded on open rather than on mount: these pickers sit on forms that may
  // never open one, and listing the bucket has a cost.
  useEffect(() => {
    if (!open) return;
    setChosen([]);
    void loadPage();
  }, [open, loadPage]);

  // Escape closes, matching the confirm dialogs elsewhere in the portal.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function emit(urls: string[]) {
    onSelect(urls);
    if (onSelectItems) {
      onSelectItems(urls.map((url) => images.find((image) => image.url === url)!).filter(Boolean));
    }
  }

  function toggle(url: string) {
    if (!multiple) {
      emit([url]);
      onClose();
      return;
    }
    setChosen((prev) => (prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]));
  }

  function confirmMultiple() {
    if (chosen.length) emit(chosen);
    onClose();
  }

  return (
    <div className="portal-dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="portal-dialog portal-image-picker">
        <p className="portal-dialog-title">{title}</p>
        <p className="portal-dialog-message">
          {multiple
            ? 'Select one or more images already uploaded, then add them.'
            : 'Select an image already uploaded to use it here.'}
          {total ? ` ${total} image${total === 1 ? '' : 's'} in the library.` : ''}
        </p>

        {errorMessage ? <div className="portal-card portal-error">{errorMessage}</div> : null}

        {!loading && images.length === 0 ? (
          <div className="portal-empty-state">
            Nothing uploaded yet. Upload an image and it becomes available here.
          </div>
        ) : (
          <div className="portal-image-picker-grid">
            {images.map((image) => {
              const isUsed = used.has(image.objectKey);
              const isChosen = chosen.includes(image.url);
              return (
                <button
                  key={image.objectKey}
                  type="button"
                  className={`portal-image-picker-item${isChosen ? ' is-chosen' : ''}${
                    isUsed ? ' is-used' : ''
                  }`}
                  onClick={() => toggle(image.url)}
                  title={isUsed ? 'Already used here' : formatBytes(image.sizeBytes)}
                >
                  <img src={image.url} alt="" loading="lazy" />
                  {isUsed ? <span className="portal-image-picker-tag">In use</span> : null}
                  {isChosen ? <span className="portal-image-picker-tag is-chosen">Selected</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {loading ? <p className="portal-muted">Loading images...</p> : null}

        {cursor && !loading ? (
          <button type="button" className="portal-inline-btn" onClick={() => void loadPage(cursor)}>
            Load More
          </button>
        ) : null}

        <div className="portal-dialog-actions">
          <button type="button" className="portal-ghost-btn" onClick={onClose}>
            Cancel
          </button>
          {multiple ? (
            <button
              type="button"
              className="portal-primary-btn"
              onClick={confirmMultiple}
              disabled={chosen.length === 0}
            >
              {chosen.length ? `Add ${chosen.length} Image${chosen.length === 1 ? '' : 's'}` : 'Add'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
