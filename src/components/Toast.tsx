import { create } from 'zustand';
import { X } from 'lucide-react';
import { createId } from '@/lib/util';
import './toast.css';

export interface ToastAction {
  label: string;
  onAction(): void;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'neutral' | 'error';
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  dismiss(id: string): void;
}

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE = 3;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Shows a transient message. Pass an `action` for undo-style affordances.
 * Returns a function that dismisses the toast early.
 */
export function showToast(
  message: string,
  options: { tone?: Toast['tone']; action?: ToastAction; durationMs?: number } = {},
): () => void {
  const toast: Toast = { id: createId(), message, tone: options.tone ?? 'neutral', action: options.action };
  useToastStore.setState((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_VISIBLE) }));
  const dismiss = () => useToastStore.getState().dismiss(toast.id);
  setTimeout(
    dismiss,
    options.durationMs ?? (options.action ? DEFAULT_DURATION_MS * 1.6 : DEFAULT_DURATION_MS),
  );
  return dismiss;
}

/** Renders active toasts. Mounted once at the app root. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="toast-host" role="region" aria-label="Notifications">
      <div className="toast-host__list" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast__message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action!.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast__close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
