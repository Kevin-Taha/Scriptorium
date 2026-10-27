import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="library-dialog"
      aria-labelledby="library-dialog-title"
      aria-describedby="library-dialog-description"
      onClose={onCancel}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 id="library-dialog-title">{title}</h2>
      <p id="library-dialog-description">{description}</p>
      <div className="library-dialog__actions">
        <button className="btn" autoFocus disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn library-dialog__danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </dialog>
  );
}
