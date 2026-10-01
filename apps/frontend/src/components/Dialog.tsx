import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export type ConfirmOptions = {
  title: string;
  /** Détail sous le titre : texte, ou liste de ce que l'action touche. */
  message?: ReactNode;
  confirmLabel?: string;
  /** Action destructive : bouton de confirmation rouge. */
  danger?: boolean;
};

export type PromptOptions = {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  multiline?: boolean;
  /** Saisie facultative : une réponse vide est acceptée. */
  optional?: boolean;
};

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

type Dialogs = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<Dialogs | null>(null);

/**
 * Fenêtres de confirmation et de saisie de toute l'application, à la place de
 * `window.confirm` et `window.prompt`. Un `<dialog>` modal : le navigateur
 * piège le focus, ferme sur Échap et rend le focus à l'élément d'origine.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(Request & { host: Element }) | null>(null);

  const open = useCallback((next: Request) => {
    // Ouverte depuis une page construite, la fenêtre en hérite le thème.
    const host = document.activeElement?.closest('.themed') ?? document.body;
    setRequest((current) => {
      // Une seule fenêtre à la fois : la précédente est annulée.
      if (current?.kind === 'confirm') current.resolve(false);
      if (current?.kind === 'prompt') current.resolve(null);
      return { ...next, host };
    });
  }, []);

  const dialogs = useMemo<Dialogs>(
    () => ({
      confirm: (options) => new Promise((resolve) => open({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise((resolve) => open({ kind: 'prompt', options, resolve })),
    }),
    [open],
  );

  return (
    <DialogContext.Provider value={dialogs}>
      {children}
      {request &&
        createPortal(
          <DialogWindow request={request} onDone={() => setRequest(null)} />,
          request.host,
        )}
    </DialogContext.Provider>
  );
}

function useDialogs(): Dialogs {
  const dialogs = useContext(DialogContext);
  if (!dialogs) throw new Error('DialogProvider manquant');
  return dialogs;
}

/** `await confirm({ title, danger })` → `true` si l'utilisateur confirme. */
export const useConfirm = () => useDialogs().confirm;
/** `await prompt({ title, label })` → le texte saisi, ou `null` si annulé. */
export const usePrompt = () => useDialogs().prompt;

/**
 * Fenêtre modale à contenu libre (plusieurs actions, liste de conséquences).
 * Pour une simple confirmation ou une saisie, préférer `useConfirm` / `usePrompt`.
 */
export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  /** Échap, clic sur le fond : la fenêtre demande à être fermée. */
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // `close()` rend le focus à l'élément qui avait ouvert la fenêtre.
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Le clic sur le fond atteint le `<dialog>` lui-même, pas son contenu.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function DialogWindow({ request, onDone }: { request: Request; onDone: () => void }) {
  const { t } = useTranslation();
  const { options } = request;
  const [value, setValue] = useState(
    request.kind === 'prompt' ? (request.options.initial ?? '') : '',
  );

  const finish = (accepted: boolean) => {
    if (request.kind === 'confirm') request.resolve(accepted);
    else request.resolve(accepted ? value.trim() : null);
    onDone();
  };

  const danger = request.kind === 'confirm' && !!request.options.danger;
  return (
    <Modal title={options.title} onClose={() => finish(false)}>
      <form
        className="dialog-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          finish(true);
        }}
      >
        {request.kind === 'confirm' && request.options.message && (
          <div className="dialog-message">{request.options.message}</div>
        )}
        {request.kind === 'prompt' && (
          <label>
            {request.options.label}
            {request.options.multiline ? (
              <textarea
                rows={3}
                autoFocus
                required={!request.options.optional}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <input
                autoFocus
                required={!request.options.optional}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </label>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            // Une action destructive ne doit pas partir sur un Entrée machinal.
            autoFocus={danger}
            onClick={() => finish(false)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className={danger ? 'danger solid' : undefined}
            autoFocus={request.kind === 'confirm' && !danger}
          >
            {options.confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Demande confirmation, puis lance `action` si elle est donnée (gestionnaires de clic). */
export function useConfirmed() {
  const confirm = useConfirm();
  return (options: ConfirmOptions, action: () => void) => {
    void confirm(options).then((ok) => {
      if (ok) action();
    });
  };
}
