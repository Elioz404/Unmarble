import { useEffect, useState } from 'react';
import { COMMUNITY } from '../../../shared/config.ts';
import { isPerfect, shareLine } from '../../../shared/game/scoring.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type {
  PlayerView,
  ScarMap,
  SheetDescriptor,
  SheetThread,
  Standing,
  TrapCatch,
} from '../../../shared/protocol/api.ts';
import { templateForWeekday } from '../../../shared/puzzle/templates.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { dateKeyOf, msUntilNextDay, weekdayOf } from '../../../shared/time/calendar.ts';
import type { ShareOutcome } from '../../platform/platform.ts';
import { COPY } from '../copy.ts';
import { CheckIcon, CopyIcon, QuillIcon } from '../icons.tsx';
import './result-card.css';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly standing: Standing | null;
  readonly player: PlayerView;
  /** Where everyone tore this sheet, once it has arrived. */
  readonly scars: ScarMap | null;
  /** This sheet's post, where it is discussed and named. */
  readonly thread: SheetThread | null;
  /** How the player's latest trap is doing. */
  readonly yourTrap: TrapCatch | null;
  /** A trap this player has not tried yet, offered as the next step. */
  readonly nextTrap: SheetDescriptor | null;
  /** When the next daily sheet appears (server time, ms). */
  readonly nextSheetAt: number;
  /** The community to join, or null where there is none (the lab). */
  readonly community: string | null;
  readonly onPlay: (sheetId: string) => void;
  readonly onCompose: () => void;
  readonly onShare: (text: string, postId: string | null) => Promise<ShareOutcome>;
  readonly onOpenThread: (url: string) => void;
  readonly onJoin: () => void;
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

const SUNDAY = 0;

/** A rank only means something once a few hands have played. */
const standingLine = (standing: Standing): string =>
  standing.stats.hands < COMMUNITY.quietHands
    ? COPY.result.early(standing.stats.hands)
    : COPY.result.rank(standing.rank, standing.stats.hands);

/** How the sheet names itself when shared: its number, or its maker for a trap. */
const shareHeading = (sheet: SheetDescriptor): string =>
  sheet.kind === 'trap' ? `· a trap by u/${sheet.author ?? 'someone'}` : `No.${sheet.number} · ${sheet.weekday}`;

const SHARE_LABEL: Record<ShareOutcome, string> = {
  shared: COPY.result.shared,
  copied: COPY.result.copied,
  failed: COPY.result.shareFailed,
};

/** Where everyone tore the sheet, and the move that caught the most, once enough hands have played. */
const CommunityScars = ({ sheet, scars }: { readonly sheet: SheetDescriptor; readonly scars: ScarMap }) => {
  if (scars.hands < COMMUNITY.quietHands) return <p className="result__scars">{COPY.result.scarsQuiet}</p>;
  const move = scars.trap ? sheet.spec.moves[scars.trap.move] : undefined;
  const ink = move?.kind === 'drop' ? getPalette(sheet.spec.paletteId).inks[move.ink] : null;
  return (
    <p className="result__scars">
      <span className="label">{COPY.result.scars(scars.hands)}</span>
      {scars.trap && move ? (
        <span className="result__caught-on">
          {ink ? <span className="result__swatch" style={{ background: ink }} aria-hidden /> : null}
          {COPY.result.caughtOn(scars.trap.share, move.kind)}
        </span>
      ) : null}
    </p>
  );
};

/**
 * The single end card: what you did, how it compares, and the next steps —
 * share it, set a trap, name the sheet, spring someone's trap. Play, comment,
 * join and flair are always separate actions, never bundled.
 */
export const ResultCard = ({
  sheet,
  state,
  standing,
  player,
  scars,
  thread,
  yourTrap,
  nextTrap,
  nextSheetAt,
  community,
  onPlay,
  onCompose,
  onShare,
  onOpenThread,
  onJoin,
  onLogin,
  onFlair,
}: Props) => {
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const [flair, setFlair] = useState(player.flair);
  const countdown = useCountdown();
  const isTrap = sheet.kind === 'trap';
  const marks = state.history.filter((h) => h.action.type !== 'magnify');
  // The next daily, whatever sheet this is (an old one from the Book, or a trap).
  const nextDay = dateKeyOf(nextSheetAt);
  const tomorrow = templateForWeekday(weekdayOf(nextDay));
  // Sunday may be the week's best trap, whose difficulty is its own.
  const tomorrowStars = weekdayOf(nextDay) === SUNDAY ? null : tomorrow.stars;
  const duration = standing?.result.durationMs ?? state.history[state.history.length - 1]?.at ?? 0;

  const share = async (): Promise<void> => {
    setShared(await onShare(shareLine(shareHeading(sheet), sheet.spec.stars, state), thread?.postId ?? null));
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
          {standing && standing.stats.hands >= COMMUNITY.quietHands
            ? COPY.trap.caught(standing.stats.caught, standing.stats.hands)
            : null}
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
            <dd>{standingLine(standing)}</dd>
          </div>
        ) : null}
        {!isTrap && standing && standing.streak > 0 ? (
          <div>
            <dt className="label">Streak</dt>
            <dd>{COPY.result.streak(standing.streak)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="result__primary">
        <div className="actions">
          <button type="button" className="button button--primary" onClick={() => void share()}>
            {shared === 'shared' || shared === 'copied' ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
            {COPY.result.share}
          </button>
          <button type="button" className="button" onClick={onCompose}>
            <QuillIcon size={18} />
            {COPY.trap.set}
          </button>
        </div>
        <p className="result__note" role="status">
          {shared ? SHARE_LABEL[shared] : COPY.book.sundayRule}
        </p>
      </div>

      {scars ? <CommunityScars sheet={sheet} scars={scars} /> : null}

      {thread ? (
        <div className="result__thread">
          <button type="button" className="result__thread-button" onClick={() => onOpenThread(thread.url)}>
            {thread.naming && !isTrap
              ? COPY.result.nameIt
              : isTrap
                ? COPY.result.tellMaker(sheet.author ?? 'someone')
                : COPY.result.comments}
          </button>
          {thread.naming && !isTrap ? <p className="result__note">{COPY.result.nameHow}</p> : null}
        </div>
      ) : null}

      {nextTrap ? (
        <button type="button" className="result__next-trap" onClick={() => onPlay(nextTrap.id)}>
          <span>{COPY.trap.next(nextTrap.author ?? 'someone')}</span>
          <span className="result__stars">{'★'.repeat(nextTrap.spec.stars)}</span>
        </button>
      ) : null}

      {yourTrap && yourTrap.sheetId !== sheet.id ? (
        <p className="result__your-trap">{COPY.result.yourTrap(yourTrap.caught, yourTrap.hands)}</p>
      ) : null}

      <div className="result__secondary">
        {community ? (
          <button type="button" className="result__link" onClick={onJoin}>
            {COPY.result.join(community)}
          </button>
        ) : null}
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
        <span className="result__tomorrow">{COPY.result.tomorrow(tomorrow.title, tomorrowStars, tomorrow.promise)}</span>
      </footer>
    </section>
  );
};
