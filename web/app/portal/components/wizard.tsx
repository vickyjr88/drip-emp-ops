"use client";

/**
 * A long form that becomes a short sequence of steps on a phone and stays one page on a desktop.
 *
 * Every step is always in the page, so nothing about how a form reads its fields changes. On a phone (see portal-mobile.css) only the
 * current step is shown, under a progress strip, with Back / Next fixed to the bottom of the screen where a thumb reaches. Next checks
 * the step's own required fields first, so a person is told what is missing while they are still looking at it. On a desktop the strip
 * and the Next bar are hidden and the form's own submit row shows, as before.
 *
 *   <Wizard titles={['Basics', 'Prices', 'Photos']} submitLabel="Add product" saving={saving} onCancel={...}>
 *     {(wiz) => (
 *       <form noValidate onSubmit={wiz.onSubmit(save)} onInvalidCapture={wiz.onInvalid}>
 *         <WizStep wiz={wiz} index={0}>...</WizStep>
 *         ...
 *         {wiz.bar}
 *       </form>
 *     )}
 *   </Wizard>
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type WizardApi = {
  step: number;
  count: number;
  titles: string[];
  isLast: boolean;
  go: (index: number) => void;
  /** Wraps the form's submit handler: on a phone, anywhere but the last step, Enter moves on instead of saving. */
  onSubmit: (handler: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>) => (event: React.FormEvent<HTMLFormElement>) => void;
  /** Put on the form as onInvalidCapture: a field the browser rejects on a hidden step brings that step into view. */
  onInvalid: (event: React.FormEvent<HTMLFormElement>) => void;
  bar: React.ReactNode;
};

const StepContext = createContext<number>(0);

const PHONE = '(max-width: 760px)';

export function Wizard({
  titles, submitLabel, saving, submitDisabled, check, desktopBar = true, onCancel, cancelLabel = 'Cancel', children,
}: {
  titles: string[];
  submitLabel: string;
  saving?: boolean;
  /** The last step's button is off until the form can be saved (the form says why elsewhere on that step). */
  submitDisabled?: boolean;
  /** Extra rule for moving on: return a sentence to stop at this step, or null to go ahead. */
  check?: (step: number) => string | null;
  /** The form's own submit row on a desktop. Turn off when the form already has its own button there. */
  desktopBar?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  children: (wiz: WizardApi) => React.ReactNode;
}) {
  const [step, setStep] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const pointed = useRef(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const count = titles.length;
  const isLast = step === count - 1;

  const phone = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;

  const show = useCallback((index: number) => {
    setStepError(null);
    setStep(Math.max(0, Math.min(count - 1, index)));
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [count]);

  /** The first field on this step the browser would reject, shown to the person. True when the step is fine. */
  const stepIsValid = useCallback(() => {
    const panel = root.current?.querySelector<HTMLElement>(`[data-wiz-step="${step}"]`);
    if (!panel) return true;
    const fields = Array.from(panel.querySelectorAll<HTMLInputElement>('input, select, textarea'));
    const bad = fields.find((field) => !field.disabled && !field.checkValidity());
    if (!bad) return true;
    bad.reportValidity();
    return false;
  }, [step]);

  const next = () => {
    if (!stepIsValid()) return;
    const stop = check?.(step);
    if (stop) { setStepError(stop); return; }
    show(step + 1);
  };

  // Back button on the phone moves a step back rather than leaving the form.
  useEffect(() => { root.current?.setAttribute('data-wiz-current', String(step)); }, [step]);

  const api: WizardApi = {
    step, count, titles, isLast, go: show,
    // Forms using this are marked noValidate: the checking is done here, so a field on a step that is not showing is brought into view
    // before the browser points at it.
    onSubmit: (handler) => (event) => {
      if (phone() && !isLast) { event.preventDefault(); next(); return; }
      const form = event.currentTarget;
      if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); return; }
      void handler(event);
    },
    onInvalid: (event) => {
      const field = event.target as HTMLInputElement;
      const panel = field.closest<HTMLElement>('[data-wiz-step]');
      const index = panel ? Number(panel.dataset.wizStep) : step;
      if (!phone() || index === step || pointed.current) return;
      // Only the first bad field is pointed at; show its step, then ask the browser to point once it is on screen.
      pointed.current = true;
      setStep(index);
      window.setTimeout(() => { field.reportValidity(); pointed.current = false; }, 60);
    },
    bar: (
      <>
        {desktopBar ? (
          <div className="wiz-actions">
            <button type="submit" className="portal-primary-btn" disabled={saving || submitDisabled}>{saving ? 'Saving...' : submitLabel}</button>
            {onCancel ? <button type="button" className="portal-ghost-btn" onClick={onCancel}>{cancelLabel}</button> : null}
          </div>
        ) : null}
        {stepError ? <p className="wiz-error" role="alert">{stepError}</p> : null}
        <div className="wiz-bar" role="group" aria-label="Steps">
          {step > 0
            ? <button type="button" className="portal-ghost-btn" onClick={() => show(step - 1)}>Back</button>
            : onCancel ? <button type="button" className="portal-ghost-btn" onClick={onCancel}>{cancelLabel}</button> : <span />}
          {isLast
            ? <button type="submit" className="portal-primary-btn" disabled={saving || submitDisabled}>{saving ? 'Saving...' : submitLabel}</button>
            : <button type="button" className="portal-primary-btn" onClick={next}>Next</button>}
        </div>
      </>
    ),
  };

  return (
    <div className="wiz" ref={root} data-wiz-current={step}>
      <ol className="wiz-progress" aria-label="Steps">
        {titles.map((title, index) => (
          <li key={title} className={index === step ? 'is-current' : index < step ? 'is-done' : ''}>
            <button type="button" onClick={() => (index < step ? show(index) : undefined)} disabled={index >= step} aria-current={index === step ? 'step' : undefined}>
              <span className="wiz-dot">{index < step ? '✓' : index + 1}</span>
              <span className="wiz-label">{title}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="wiz-now">Step {step + 1} of {count}: <strong>{titles[step]}</strong></p>
      <StepContext.Provider value={step}>{children(api)}</StepContext.Provider>
    </div>
  );
}

/** One step's fields. A phone shows only the current one; a desktop shows them all, each under its own small heading. */
export function WizStep({ wiz, index, children }: { wiz: WizardApi; index: number; children: React.ReactNode }) {
  const current = useContext(StepContext);
  return (
    <div className={`wiz-step${current === index ? ' is-current' : ''}`} data-wiz-step={index}>
      <h3 className="wiz-step-title">{wiz.titles[index]}</h3>
      {children}
    </div>
  );
}
