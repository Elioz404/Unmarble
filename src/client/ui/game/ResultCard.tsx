import { useEffect, useState } from 'react';
import { isPerfect, shareLine } from '../../../shared/game/scoring.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type { PlayerView, SheetDescriptor, Standing } from '../../../shared/protocol/api.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { msUntilNextDay, paletteIdFor } from '../../../shared/time/calendar.ts';
import { COPY } from '../copy.ts';
import { CheckIcon, CopyIcon, QuillIcon } from '../icons.tsx';
import './result-card.css';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly standing: Standing | null;
  readonly player: PlayerView;
  /** A trap this player has not tried yet, offered as the next step. */
  readonly nextTrap: SheetDescriptor | null;
  readonly onPlay: (sheetId: string) => void;
  readonly onCompose: () => void;
  readonly onSubscribe: () => Promise<boolean>;
  readonly onLogin: () => void;
  readonly onFlair: (enabled: boolean) => Promise<boolean>;
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

const headlineOf = (state: SessionState, standing: Standing | null): string => {
  if (state.status === 'torn') return COPY.result.torn;
  if (standing && isPerfect(standing.result)) return COPY.result.perfect;
  return state.blots > 0 ? COPY.result.cleanWithBlots(state.blots) : COPY.result.clean;
};

/**
 * The single end card: what you did, how it compares, and one meaningful next
 * step — a trap to spring, or one to set. Play, comment, subscribe and flair
 * are always separate actions, never bundled.
 */
export const ResultCard = ({ sheet, state, standing, player, nextTrap, onPlay, onCompose, onSubscribe, onLogin, onFlair }: Props) => {
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [flair, setFlair] = useState(player.flair);
  const countdown = useCountdown();
  const isTrap = sheet.kind === 'trap';
  const marks = state.history.filter((h) => h.action.type !== 'magnify');
  const tomorrow = getPalette(paletteIdFor(sheet.number + 1)).name;
  const duration = standing?.result.durationMs ?? state.history[state.history.length - 1]?.at ?? 0;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLine(sheet.number, sheet.weekday, sheet.spec.stars, state));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const toggleFlair = (): void => {
    const next = !flair;
    setFlair(next);
    onFlair(next)
      .then(setFlair)
      .catch(() => setFlair(!next));
  };

  return (
    <section className="result" aria-label="Result">
      <header className="result__head">
        <h2 className="result__headline" data-tone={state.status}>
          {headlineOf(state, standing)}
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

      {isTrap ? (
        <p className="result__trap">
          {state.blots > 0 ? COPY.trap.gotCaught : COPY.trap.sawThrough}{' '}
          {standing ? COPY.trap.caught(standing.stats.caught, standing.stats.hands) : null}
        </p>
      ) : null}

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
        {!isTrap && standing && standing.streak > 0 ? (
          <div>
            <dt className="label">Streak</dt>
            <dd>{COPY.result.streak(standing.streak)}</dd>
          </div>
        ) : null}
      </dl>

      {nextTrap ? (
        <button type="button" className="result__next-trap" onClick={() => onPlay(nextTrap.id)}>
          <span>{COPY.trap.next(nextTrap.author ?? 'someone')}</span>
          <span className="result__stars">{'★'.repeat(nextTrap.spec.stars)}</span>
        </button>
      ) : null}

      {!isTrap ? <p className="result__name">{COPY.result.nameIt}</p> : null}

      <div className="actions">
        <button type="button" className="button button--primary" onClick={() => void copy()}>
          {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          {copied ? COPY.result.copied : COPY.result.copy}
        </button>
        <button type="button" className="button" onClick={onCompose}>
          <QuillIcon size={18} />
          {COPY.trap.set}
        </button>
      </div>

      <div className="result__secondary">
        <button type="button" className="result__link" disabled={joined} onClick={() => void onSubscribe().then(setJoined)}>
          {joined ? COPY.result.subscribed : COPY.result.subscribe}
        </button>
        {player.signedIn && !isTrap ? (
          <label className="result__flair">
            <input type="checkbox" checked={flair} onChange={toggleFlair} />
            <span>
              {COPY.flair.toggle}
              <small>{COPY.flair.note}</small>
            </span>
          </label>
        ) : null}
        {!player.signedIn ? (
          <button type="button" className="result__link" onClick={onLogin}>
            {COPY.result.login}
          </button>
        ) : null}
      </div>

      <footer className="result__next">
        <span className="label">{COPY.result.next}</span>
        <span className="figures result__countdown">{countdown}</span>
        <span className="result__tomorrow">{COPY.result.tomorrow(tomorrow)}</span>
      </footer>
    </section>
  );
};
