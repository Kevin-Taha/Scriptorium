import { type ReactNode, type Ref, useId } from 'react';

export function StorageSection({
  icon,
  title,
  intro,
  ref,
  children,
}: {
  icon: ReactNode;
  title: string;
  intro?: string;
  ref?: Ref<HTMLElement>;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="storage-section" aria-labelledby={titleId} ref={ref}>
      <h3 className="storage-section__title" id={titleId}>
        <span aria-hidden="true">{icon}</span>
        {title}
      </h3>
      {intro && <p className="storage-section__intro">{intro}</p>}
      {children}
    </section>
  );
}

/** A status line with an icon, an optional explanation and the actions that go with it. */
export function StorageCard({
  tone = 'neutral',
  icon,
  title,
  detail,
  live = false,
  busy = false,
  children,
}: {
  tone?: 'neutral' | 'notice' | 'error';
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
  /** Announce changes to the title to screen readers. */
  live?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`storage-card storage-card--${tone}`} aria-busy={busy || undefined}>
      <span className="storage-card__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="storage-card__body">
        <p className="storage-card__title" role={live ? 'status' : undefined}>
          {title}
        </p>
        {detail && <div className="storage-card__detail">{detail}</div>}
        {children && <div className="storage-card__actions">{children}</div>}
      </div>
    </div>
  );
}
