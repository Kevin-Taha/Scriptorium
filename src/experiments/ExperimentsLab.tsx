import { useEffect, useRef } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { useExperimentsStore } from './experimentsStore';
import { EXPERIMENTS } from './registry';
import './lab.css';

/** Toolbar button that opens the Experiments lab. */
export function LabButton({ below = true }: { below?: boolean }) {
  const openLab = useExperimentsStore((s) => s.openLab);
  const count = useExperimentsStore((s) => Object.values(s.enabled).filter(Boolean).length);
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--icon lab-button tooltip${below ? ' tooltip--below' : ''}`}
      data-tooltip="Experiments lab"
      aria-label={`Experiments lab (${count} on)`}
      aria-haspopup="dialog"
      onClick={openLab}
    >
      <FlaskConical />
      {count > 0 && (
        <span className="lab-button__count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

/** Modal list of every experiment with a switch and how to try it. */
export function ExperimentsLab() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useExperimentsStore((s) => s.labOpen);
  const enabled = useExperimentsStore((s) => s.enabled);
  const setEnabled = useExperimentsStore((s) => s.setEnabled);
  const setAll = useExperimentsStore((s) => s.setAll);
  const closeLab = useExperimentsStore((s) => s.closeLab);
  const onCount = Object.values(enabled).filter(Boolean).length;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const dismiss = () => {
    closeLab();
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    opener.current = null;
  };

  return (
    <dialog
      ref={dialog}
      className="lab-dialog"
      aria-labelledby="lab-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={() => {
        if (useExperimentsStore.getState().labOpen) dismiss();
      }}
    >
      <header className="lab-dialog__header">
        <span className="lab-dialog__icon" aria-hidden="true">
          <FlaskConical />
        </span>
        <div className="lab-dialog__heading">
          <h2 id="lab-dialog-title">Experiments lab</h2>
          <p>
            Proof-of-concept features for review. Each is off until you switch it on, and changes apply
            instantly.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Close experiments lab"
          onClick={dismiss}
        >
          <X />
        </button>
      </header>
      <div className="lab-dialog__bar">
        <span className="lab-dialog__count" role="status">
          {onCount} of {EXPERIMENTS.length} on
        </span>
        <span className="lab-dialog__spacer" />
        <button type="button" className="btn btn--sm" onClick={() => setAll(true)}>
          Turn all on
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAll(false)}>
          Turn all off
        </button>
      </div>
      <ol className="lab-dialog__list">
        {EXPERIMENTS.map((experiment, index) => {
          const on = enabled[experiment.id];
          const switchId = `lab-switch-${experiment.id}`;
          return (
            <li
              key={experiment.id}
              className={`lab-card${on ? ' is-on' : ''}`}
              data-experiment={experiment.id}
            >
              <div className="lab-card__main">
                <div className="lab-card__title-row">
                  <span className="lab-card__number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <label className="lab-card__title" htmlFor={switchId}>
                    {experiment.title}
                  </label>
                  <span className={`lab-card__kind lab-card__kind--${experiment.kind.toLowerCase()}`}>
                    {experiment.kind}
                  </span>
                  {experiment.shortcut && <kbd className="kbd">{experiment.shortcut}</kbd>}
                </div>
                <p className="lab-card__summary">{experiment.summary}</p>
                <details className="lab-card__try" open={on}>
                  <summary>How to try it</summary>
                  <ol>
                    {experiment.tryIt.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              </div>
              <input
                id={switchId}
                type="checkbox"
                // biome-ignore lint/a11y/useAriaPropsForRole: the native checkbox already exposes its checked state
                role="switch"
                className="lab-card__switch"
                checked={on}
                onChange={(event) => setEnabled(experiment.id, event.target.checked)}
              />
            </li>
          );
        })}
      </ol>
      <footer className="lab-dialog__footer">
        Tip: add <code>?exp=all</code> or <code>?exp=minimap,focus-mode</code> to the address to start with
        experiments on.
      </footer>
    </dialog>
  );
}
