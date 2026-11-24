"use client";

/**
 * A search box that suggests as you type: one field, results from the server, arrow keys and Enter, Escape to close.
 *
 * Built for entering things fast. Enter with nothing highlighted takes the first result, so "wanj", Enter picks Wanjiku. Results that arrive late
 * for something already retyped are dropped, so the list never shows an answer to an old question. It follows the standard combobox pattern
 * (role, aria-expanded, aria-activedescendant), so a screen reader announces the list and the highlighted row.
 */

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';

export type ComboboxProps<T> = {
  label?: string;
  hint?: string;
  value: string;
  onValueChange: (text: string) => void;
  /** Called with what was typed; return the matches. Aborted when the person types again. */
  fetchOptions: (query: string, signal: AbortSignal) => Promise<T[]>;
  optionKey: (option: T) => string;
  renderOption: (option: T) => ReactNode;
  onSelect: (option: T) => void;
  /** A last row for "what you typed is not here": create it, or carry on without. */
  action?: { label: (query: string) => string; onSelect: (query: string) => void };
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: 'text' | 'tel' | 'email' | 'search';
  emptyText?: (query: string) => string;
  /** Clear the box after a pick (adding items one after another) rather than keeping the text. */
  clearOnSelect?: boolean;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
};

export function Combobox<T>({
  label, hint, value, onValueChange, fetchOptions, optionKey, renderOption, onSelect, action, placeholder, minChars = 2, disabled, autoFocus,
  inputMode = 'search', emptyText, clearOnSelect, inputRef,
}: ComboboxProps<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const localInput = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const enterQueued = useRef(false);
  const pickRef = useRef<(option: T) => void>(() => {});
  const query = value.trim();
  const searchable = query.length >= minChars;

  // Ask the server, a moment after the last key.
  useEffect(() => {
    abort.current?.abort();
    if (!searchable) { setOptions([]); setBusy(false); setFailed(false); return; }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    const timer = setTimeout(() => {
      fetchOptions(query, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setOptions(found); setFailed(false); setActive(-1);
          // Enter was pressed while this search was still running: take the first result now that it is here.
          if (enterQueued.current) {
            enterQueued.current = false;
            if (found.length > 0) { pickRef.current(found[0]); }
          }
        })
        .catch(() => { if (!controller.signal.aborted) { setOptions([]); setFailed(true); } })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
    // fetchOptions is deliberately not a dependency: it is recreated on every render by most callers, and only the text should trigger a search.
  }, [query, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const rows = options.length + (action && searchable ? 1 : 0);

  const choose = useCallback((index: number) => {
    if (index < options.length) {
      onSelect(options[index]);
      setOpen(false);
      if (clearOnSelect) onValueChange('');
    } else if (action) {
      action.onSelect(query);
      setOpen(false);
    }
  }, [options, onSelect, action, query, clearOnSelect, onValueChange]);

  pickRef.current = (option: T) => {
    onSelect(option);
    setOpen(false);
    if (clearOnSelect) onValueChange('');
  };

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (rows ? (i + 1) % rows : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (rows ? (i <= 0 ? rows - 1 : i - 1) : -1));
    } else if (event.key === 'Enter') {
      if (!open || !searchable) return;
      // Still searching: hold the Enter and apply it when the answer lands (typing again cancels it).
      if ((busy || (options.length === 0 && !failed)) && active < 0) { event.preventDefault(); enterQueued.current = true; return; }
      // Nothing highlighted: take the first result, so typing a few letters and pressing Enter is enough.
      const index = active >= 0 ? active : options.length > 0 ? 0 : -1;
      if (index >= 0) { event.preventDefault(); choose(index); }
    } else if (event.key === 'Escape') {
      if (open) { event.stopPropagation(); setOpen(false); }
    }
  }

  const showList = open && searchable;
  const setRef = (element: HTMLInputElement | null) => {
    localInput.current = element;
    if (inputRef) inputRef.current = element;
  };

  return (
    <div className="pcb" ref={wrapRef}>
      {label ? <label className="pcb-label" htmlFor={id}>{label}</label> : null}
      <div className="pcb-field">
        <input
          id={id}
          ref={setRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode={inputMode}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => { enterQueued.current = false; onValueChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {busy ? <span className="pcb-spinner" aria-hidden="true" /> : null}
        {value && !disabled ? (
          <button type="button" className="pcb-clear" aria-label="Clear" onClick={() => { onValueChange(''); localInput.current?.focus(); }}>&times;</button>
        ) : null}
      </div>
      {hint ? <small className="pcb-hint">{hint}</small> : null}

      {showList ? (
        <ul className="pcb-list" id={listId} role="listbox" aria-label={label ?? 'Suggestions'}>
          {options.map((option, index) => (
            <li
              key={optionKey(option)}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={active === index}
              className={`pcb-option${active === index ? ' is-active' : ''}`}
              // mousedown, not click: the input must not lose focus (and close the list) before the pick lands.
              onMouseDown={(event) => { event.preventDefault(); choose(index); }}
              onMouseEnter={() => setActive(index)}
            >
              {renderOption(option)}
            </li>
          ))}
          {!busy && options.length === 0 ? (
            <li className="pcb-empty" role="presentation">{failed ? 'Could not search. Try again.' : emptyText ? emptyText(query) : 'No match.'}</li>
          ) : null}
          {action ? (
            <li
              id={`${id}-opt-${options.length}`}
              role="option"
              aria-selected={active === options.length}
              className={`pcb-option is-action${active === options.length ? ' is-active' : ''}`}
              onMouseDown={(event) => { event.preventDefault(); choose(options.length); }}
              onMouseEnter={() => setActive(options.length)}
            >
              {action.label(query)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
