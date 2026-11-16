import { COPY } from './copy.ts';
import { DropMark } from './icons.tsx';
import './status-screen.css';

/** Loading and failure states: quiet, branded, never a spinner wall. */
export const StatusScreen = ({ kind }: { readonly kind: 'loading' | 'failed' }) => (
  <main className="status" aria-busy={kind === 'loading'}>
    <span className="status__mark" data-kind={kind}>
      <DropMark size={36} />
    </span>
    <p className="label">{COPY.wordmark}</p>
    <p className="status__text">
      {kind === 'loading' ? 'Laying out the sheet…' : 'The bath is unsettled. Try again in a moment.'}
    </p>
  </main>
);
