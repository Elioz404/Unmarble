import { COPY } from './copy.ts';
import { DropMark } from './icons.tsx';
import './status-screen.css';

type Props = {
  readonly kind: 'loading' | 'failed';
  /** Offered when loading failed: try the same request again. */
  readonly onRetry?: (() => void) | undefined;
  /** Offered when loading failed somewhere other than home: go back. */
  readonly onBack?: (() => void) | undefined;
};

/** Loading and failure states: quiet, branded, never a spinner wall, never a dead end. */
export const StatusScreen = ({ kind, onRetry, onBack }: Props) => (
  <main className="status" aria-busy={kind === 'loading'}>
    <span className="status__mark" data-kind={kind}>
      <DropMark size={36} />
    </span>
    <p className="label">{COPY.wordmark}</p>
    <p className="status__text">
      {kind === 'loading' ? 'Laying out the sheet…' : 'The bath is unsettled. Try again in a moment.'}
    </p>
    {kind === 'failed' && (onRetry || onBack) ? (
      <div className="actions status__actions">
        {onRetry ? (
          <button type="button" className="button button--primary" onClick={onRetry}>
            {COPY.retry}
          </button>
        ) : null}
        {onBack ? (
          <button type="button" className="button" onClick={onBack}>
            {COPY.book.back}
          </button>
        ) : null}
      </div>
    ) : null}
  </main>
);
