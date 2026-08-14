"use client";

import { FormEvent, ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';

type FieldSpec = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'textarea' | 'select';
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
};

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOptions = {
  title: string;
  message?: ReactNode;
  fields: FieldSpec[];
  confirmLabel?: string;
  cancelLabel?: string;
};

type AlertOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
};

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: Record<string, string> | null) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | null;

type PortalDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<Record<string, string> | null>;
  alert: (options: AlertOptions) => Promise<void>;
};

const PortalDialogContext = createContext<PortalDialogContextValue | null>(null);

export function usePortalDialog() {
  const context = useContext(PortalDialogContext);
  if (!context) {
    throw new Error('usePortalDialog must be used within a PortalDialogProvider');
  }
  return context;
}

export function PortalDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ kind: 'confirm', options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    const initial: Record<string, string> = {};
    for (const field of options.fields) initial[field.name] = field.defaultValue || '';
    setFieldValues(initial);
    return new Promise<Record<string, string> | null>((resolve) => {
      setDialog({ kind: 'prompt', options, resolve });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({ kind: 'alert', options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm, prompt, alert }), [confirm, prompt, alert]);

  function close() {
    setDialog(null);
    setFieldValues({});
  }

  function onPromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.kind !== 'prompt') return;
    for (const field of dialog.options.fields) {
      if (field.required && !fieldValues[field.name]?.trim()) return;
    }
    dialog.resolve(fieldValues);
    close();
  }

  return (
    <PortalDialogContext.Provider value={value}>
      {children}
      {dialog ? (
        <div className="portal-dialog-overlay" role="presentation" onClick={() => {
          if (dialog.kind === 'confirm') { dialog.resolve(false); close(); }
          else if (dialog.kind === 'prompt') { dialog.resolve(null); close(); }
          else { dialog.resolve(); close(); }
        }}>
          <div className="portal-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="portal-dialog-title">{dialog.options.title}</h2>
            {dialog.kind !== 'prompt' && dialog.options.message ? (
              <div className="portal-dialog-message">{dialog.options.message}</div>
            ) : null}

            {dialog.kind === 'prompt' ? (
              <form onSubmit={onPromptSubmit}>
                {dialog.options.message ? <div className="portal-dialog-message">{dialog.options.message}</div> : null}
                <div className="portal-dialog-fields">
                  {dialog.options.fields.map((field) => (
                    <label key={field.name} className="portal-dialog-field">
                      <span>{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={fieldValues[field.name] || ''}
                          placeholder={field.placeholder}
                          required={field.required}
                          autoFocus={dialog.options.fields[0].name === field.name}
                          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={fieldValues[field.name] || ''}
                          required={field.required}
                          autoFocus={dialog.options.fields[0].name === field.name}
                          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                        >
                          <option value="">{field.placeholder || 'Select...'}</option>
                          {(field.options || []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type || 'text'}
                          value={fieldValues[field.name] || ''}
                          placeholder={field.placeholder}
                          required={field.required}
                          autoFocus={dialog.options.fields[0].name === field.name}
                          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                </div>
                <div className="portal-dialog-actions">
                  <button
                    type="button"
                    className="portal-ghost-btn"
                    onClick={() => {
                      dialog.resolve(null);
                      close();
                    }}
                  >
                    {dialog.options.cancelLabel || 'Cancel'}
                  </button>
                  <button type="submit" className="portal-primary-btn">
                    {dialog.options.confirmLabel || 'Continue'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="portal-dialog-actions">
                {dialog.kind === 'confirm' ? (
                  <button
                    type="button"
                    className="portal-ghost-btn"
                    onClick={() => {
                      dialog.resolve(false);
                      close();
                    }}
                  >
                    {dialog.options.cancelLabel || 'Cancel'}
                  </button>
                ) : null}
                <button
                  type="button"
                  autoFocus
                  className={dialog.kind === 'confirm' && dialog.options.danger ? 'portal-primary-btn is-danger' : 'portal-primary-btn'}
                  onClick={() => {
                    if (dialog.kind === 'confirm') dialog.resolve(true);
                    else dialog.resolve();
                    close();
                  }}
                >
                  {dialog.options.confirmLabel || 'OK'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </PortalDialogContext.Provider>
  );
}
