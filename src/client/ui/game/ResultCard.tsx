import { useEffect, useState } from 'react';
import { isPerfect, shareLine } from '../../../shared/game/scoring.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type { SheetDescriptor, Standing } from '../../../shared/protocol/api.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { msUntilNextDay, paletteIdFor } from '../../../shared/time/calendar.ts';
import { COPY } from '../copy.ts';
import { CheckIcon, CopyIcon } from '../icons.tsx';
import './result-card.css';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly standing: Standing | null;
  readonly signedIn: boolean;
  readonly onSubscribe: () => Promise<boolean>;
  readonly onLogin: () => void;
};

const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const useCountdown = (): string => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = msUntilNextDay(now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * The single end card: what you did, how it compares, and one meaningful next
 * step. Play, comment and subscribe are always separate actions.
 */
export const ResultCard = ({ sheet, state, standing, signedIn, onSubscribe, onLogin }: Props) => {
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const countdown = useCountdown();
  const result = standing?.result;
  const blots = state.blots;
  const headline =
    state.status === 'torn'
      ? COPY.result.torn
      : result && isPerfect(result)
        ? COPY.result.perfect
        : blots > 0
          ? COPY.result.cleanWithBlots(blots)
          : COPY.result.clean;
  const marks = state.history.filter((h) => h.action.type !== 'magnify');
  const tomorrow = getPalette(paletteIdFor(sheet.number + 1)).name;
  const duration = state.history[state.history.length - 1]?.at ?? 0;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLine(sheet.number, sheet.weekday, sheet.spec.stars, state));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="result" aria-label="Result">
      <header className="result__head">
        <h2 className="result__headline" data-tone={state.status}>
          {headline}
        </h2>
        <p className="result__marks figures" aria-label={`${marks.length} actions`}>
          {marks.map((m, i) => (
            <span key={i} data-verdict={m.verdict}>
              {m.verdict === 'correct' ? '●' : '○'}
            </span>
          ))}
          {state.magnified ? <span className="result__lens">◐</span> : null}
        </p>
      </header>

      <dl className="result__facts">
        <div>
          <dt className="label">Time</dt>
          <dd className="figures">{formatDuration(duration)}</dd>
        </div>
        {standing ? (
          <div>
            <dt className="label">Standing</dt>
            <dd>{COPY.result.rank(standing.rank, standing.stats.hands)}</dd>
          </div>
        ) : null}
        {standing && standing.streak > 0 ? (
          <div>
            <dt className="label">Streak</dt>
            <dd>{COPY.result.streak(standing.streak)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="result__name">{COPY.result.nameIt}</p>

      <div className="result__actions">
        <button type="button" className="button button--primary" onClick={() => void copy()}>
          {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          {copied ? COPY.result.copied : COPY.result.copy}
        </button>
        <button
          type="button"
          className="button"
          disabled={joined}
          onClick={() => void onSubscribe().then((ok) => setJoined(ok))}
        >
          {joined ? COPY.result.subscribed : COPY.result.subscribe}
        </button>
      </div>
      {!signedIn ? (
        <button type="button" className="result__login" onClick={onLogin}>
          {COPY.result.login}
        </button>
      ) : null}

      <footer className="result__next">
        <span className="label">{COPY.result.next}</span>
        <span className="figures result__countdown">{countdown}</span>
        <span className="result__tomorrow">{COPY.result.tomorrow(tomorrow)}</span>
      </footer>
    </section>
  );
};
