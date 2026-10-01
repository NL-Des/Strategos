import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

type Toast = { id: number; message: string };

/** Durée d'affichage : assez longue pour être lue, et le message reste fermable. */
const TOAST_MS = 6000;

const ToastContext = createContext<((message: string) => void) | null>(null);

/**
 * Confirmations de réussite (« Enregistré », « Publié »…) : un message en bas
 * de l'écran, annoncé aux lecteurs d'écran, qui s'efface seul. Les erreurs ne
 * passent pas par ici : elles restent affichées près de l'action (ErrorMessage).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <Icon name="checkCircle" />
            <span>{toast.message}</span>
            <button
              type="button"
              className="link toast-close"
              aria-label={t('common.close')}
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `toast(t('settings.saved'))` après une action réussie. */
export function useToast(): (message: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('ToastProvider manquant');
  return show;
}
