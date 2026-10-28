import { useEffect, useId, useRef } from 'react';

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Remove',
  busyLabel = 'Removing…',
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="library-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onCancel}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="library-dialog__actions">
        <button
          type="button"
          className="btn"
          // biome-ignore lint/a11y/noAutofocus: focus moves to the safe action when the modal opens
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="button" className="btn library-dialog__danger" disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
