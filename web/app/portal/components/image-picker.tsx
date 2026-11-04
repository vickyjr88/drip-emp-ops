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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useErrorState } from '../components/notifications';
import { apiRequest, uploadMedia } from '../accounting/lib';
import { CropDialog } from './crop-dialog';
import { usePortalDialog } from './portal-dialog';
import { MediaItem, MediaLibraryPage, formatBytes, freshUrl, objectKeyOf } from './media-types';

/** The picker's own name for a library image: the same record the media manager shows. */
type LibraryImage = MediaItem;

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
  /** Offer Crop and Square on each image (default). Both replace the image itself, everywhere it is used. */
  allowCrop?: boolean;
};

export function ImagePicker({
  open,
  token,
  onClose,
  onSelect,
  onSelectItems,
  multiple = false,
  usedUrls = [],
  title = 'Choose an image',
  allowCrop = true,
}: ImagePickerProps) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const dialog = usePortalDialog();
  const [errorMessage, setErrorMessage] = useErrorState();
  const [chosen, setChosen] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [cropping, setCropping] = useState<LibraryImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeUsedUrls = Array.isArray(usedUrls) ? usedUrls : [];
  const used = new Set(safeUsedUrls.filter(Boolean).map(objectKeyOf));

  const loadPage = useCallback(
    async (nextCursor?: string) => {
      if (!token) return;
      setLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams({ limit: '60' });
        if (nextCursor) params.set('cursor', nextCursor);
        if (search) params.set('search', search);
        const data = await apiRequest<MediaLibraryPage>(`/media/library?${params}`, { method: 'GET' }, token);
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
    [token, search],
  );

  // Typing waits a moment before searching, so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Loaded on open rather than on mount: these pickers sit on forms that may
  // never open one, and listing the bucket has a cost.
  useEffect(() => {
    if (!open) return;
    setChosen([]);
    setNotice(null);
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

  /**
   * Uploads straight from the picker, for the image nobody uploaded yet.
   *
   * A single file selects and closes immediately, same as clicking an
   * existing image in single mode -- the whole point of uploading from here
   * is to finish picking in one motion rather than cancel, go find an upload
   * button elsewhere, then reopen this dialog. In multiple mode each upload
   * is added to the library grid and marked chosen, so it can be reviewed
   * alongside anything else selected before confirming.
   */
  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !token) return;

    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded: LibraryImage[] = [];
      for (const file of files) {
        const result = await uploadMedia(file, token);
        uploaded.push({
          id: result.id ?? result.objectKey,
          objectKey: result.objectKey,
          url: result.url,
          fileName: result.fileName,
          contentType: result.contentType,
          sizeBytes: result.sizeBytes ?? file.size,
          width: result.width,
          height: result.height,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hasPreviousVersion: false,
        });
      }
      setImages((prev) => [...uploaded, ...prev]);
      setTotal((prev) => prev + uploaded.length);

      if (!multiple) {
        emit([uploaded[0].url]);
        onClose();
        return;
      }
      setChosen((prev) => [...prev, ...uploaded.map((image) => image.url)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  }

  /**
   * Cropping replaces the image itself, so it stays in its place in the grid and keeps its address; it is then used
   * straight away, which is what cropping from a picker means.
   */
  function onCropped(updated: LibraryImage) {
    setCropping(null);
    setImages((prev) => prev.map((image) => (image.id === updated.id ? updated : image)));
    if (!multiple) {
      emit([updated.url]);
      onClose();
      return;
    }
    setChosen((prev) => (prev.includes(updated.url) ? prev : [...prev, updated.url]));
    setNotice('Image cropped and selected. Everywhere it is already used now shows the cropped picture.');
  }

  /** One click: the largest centred square. Confirmed first, because it changes the image wherever it is used. */
  async function makeSquare(image: LibraryImage) {
    if (!token) return;
    const ok = await dialog.confirm({
      title: 'Make this image square?',
      message: 'It is cropped to a centred square and replaces the image everywhere it is used. You can restore the previous version from the Media library.',
      confirmLabel: 'Make square',
    });
    if (!ok) return;
    setErrorMessage(null);
    try {
      const updated = await apiRequest<LibraryImage>('/media/crop', { method: 'POST', body: JSON.stringify({ assetId: image.id, square: true }) }, token);
      onCropped(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not crop the image.');
    }
  }

  return (
    <div className="portal-dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="portal-dialog portal-image-picker">
        <div className="portal-dialog-title-row">
          <p className="portal-dialog-title">{title}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={multiple}
            hidden
            onChange={(event) => void onUpload(event)}
          />
          <button
            type="button"
            className="portal-inline-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading...' : "Can't find it? Upload New"}
          </button>
        </div>
        <p className="portal-dialog-message">
          {multiple
            ? 'Select one or more images already uploaded, then add them.'
            : 'Select an image already uploaded to use it here.'}
          {total ? ` ${total} image${total === 1 ? '' : 's'} in the library.` : ''}
        </p>

        <input
          type="search"
          className="portal-image-picker-search"
          placeholder="Search by file name…"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          aria-label="Search images by file name"
        />

        {errorMessage ? <div className="portal-card portal-error">{errorMessage}</div> : null}
        {notice ? <div className="portal-card portal-success">{notice}</div> : null}

        {!loading && images.length === 0 ? (
          <div className="portal-empty-state">
            {search ? 'No image matches that name.' : 'Nothing uploaded yet. Upload an image and it becomes available here.'}
          </div>
        ) : (
          <div className="portal-image-picker-grid">
            {images.map((image) => {
              const isUsed = used.has(image.objectKey);
              const isChosen = chosen.includes(image.url);
              return (
                <div key={image.objectKey} className="portal-image-picker-tile">
                  <button
                    type="button"
                    className={`portal-image-picker-item${isChosen ? ' is-chosen' : ''}${
                      isUsed ? ' is-used' : ''
                    }`}
                    onClick={() => toggle(image.url)}
                    title={isUsed ? 'Already used here' : [image.fileName, formatBytes(image.sizeBytes)].filter(Boolean).join(' · ')}
                  >
                    <img src={freshUrl(image)} alt={image.fileName} loading="lazy" />
                    {isUsed ? <span className="portal-image-picker-tag">In use</span> : null}
                    {isChosen ? <span className="portal-image-picker-tag is-chosen">Selected</span> : null}
                  </button>
                  {image.hasPreviousVersion ? <span className="portal-image-picker-badge">Cropped</span> : null}
                  {allowCrop ? (
                    <span className="portal-image-picker-actions">
                      <button
                        type="button"
                        className="portal-image-picker-crop"
                        onClick={() => setCropping(image)}
                        aria-label={`Crop ${image.fileName}`}
                        title="Crop this image"
                      >
                        Crop
                      </button>
                      <button
                        type="button"
                        className="portal-image-picker-crop"
                        onClick={() => void makeSquare(image)}
                        aria-label={`Make ${image.fileName} square`}
                        title="Crop to a centred square in one click"
                      >
                        Square
                      </button>
                    </span>
                  ) : null}
                </div>
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
      {cropping ? <CropDialog image={cropping} token={token} onClose={() => setCropping(null)} onCropped={onCropped} /> : null}
    </div>
  );
}
