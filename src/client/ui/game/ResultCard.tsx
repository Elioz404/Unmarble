import { useEffect, useState } from 'react';
import { COMMUNITY } from '../../../shared/config.ts';
import type { ApprenticeRun } from '../../../shared/game/apprentice.ts';
import { isPerfect, shareLine, type ShareHeading } from '../../../shared/game/scoring.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type {
  DayPreview,
  PlayerView,
  ScarMap,
  SheetDescriptor,
  SheetThread,
  Standing,
  TrapCatch,
} from '../../../shared/protocol/api.ts';
import { isMixedSunday } from '../../../shared/puzzle/daily.ts';
import { templatePreview } from '../../../shared/puzzle/templates.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { dateKeyOf, msUntilNextDay } from '../../../shared/time/calendar.ts';
import { assertNever } from '../../lib/assert-never.ts';
import type { ShareOutcome } from '../../platform/platform.ts';
import { COPY } from '../copy.ts';
import { BookIcon, CheckIcon, CopyIcon, QuillIcon } from '../icons.tsx';
import { deckle, Fillet, Fleuron, Seal, ToolStars } from '../ornaments.tsx';
import { apprenticeLine } from './apprentice-line.ts';
import { Numero, RecipeTitle } from './Chrome.tsx';
import { nextSteps, type CallStep, type LinkStep } from './next-steps.ts';
import './result-card.css';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly standing: Standing | null;
  readonly player: PlayerView;
  /** Where everyone tore this sheet, once it has arrived. */
  readonly scars: ScarMap | null;
  /** How the Apprentice played it: the comparison while the sheet is quiet. */
  readonly apprentice: ApprenticeRun;
  /** This sheet's post, where it is discussed and named. */
  readonly thread: SheetThread | null;
  /** How the player's latest trap is doing. */
  readonly yourTrap: TrapCatch | null;
  /** Someone else's trap this player has not tried yet, offered as the next step. */
  readonly nextTrap: SheetDescriptor | null;
  /** When the next daily sheet appears (server time, ms). */
  readonly nextSheetAt: number;
  /** What it will ask, as the server announced it (null from a server that does not). */
  readonly tomorrow: DayPreview | null;
  /** The community to join, or null where there is none (the lab). */
  readonly community: string | null;
  readonly onPlay: (sheetId: string) => void;
  readonly onCompose: () => void;
  readonly onOpenBook: () => void;
  readonly onShare: (text: string, postId: string | null) => Promise<ShareOutcome>;
  readonly onOpenThread: (url: string) => void;
  readonly onJoin: () => void;
  readonly onLogin: () => void;
  readonly onFlair: (enabled: boolean) => Promise<boolean>;
  readonly practice: PracticeActions;
};

/** Ways on to practice sheets: the picker from any result, and from a practice result another sheet. */
export type PracticeActions = {
  readonly pickPractice: () => void;
  readonly anotherPractice: () => void;
  /** Marbles that next sheet ahead while the card is on screen, so "Another" is instant. */
  readonly prefetchAnother: () => void;
  readonly today: () => void;
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

/** A rank only means something once a few hands have played. */
const standingLine = (standing: Standing): string =>
  standing.stats.hands < COMMUNITY.quietHands
    ? COPY.result.early(standing.stats.hands)
    : COPY.result.rank(standing.rank, standing.stats.hands);

/** How the sheet names itself when shared: its number, or its maker for a trap. */
const headingOf = (sheet: SheetDescriptor): string => {
  switch (sheet.kind) {
    case 'trap':
      return `· a trap by u/${sheet.author ?? 'someone'}`;
    case 'daily':
      return `No.${sheet.number} · ${sheet.weekday}`;
    case 'practice':
      return `· ${COPY.practice.eyebrow}`;
    default:
      return assertNever(sheet.kind);
  }
};

/** What a shared result says about its sheet: what it goes by, and the subreddit it is played in. */
const shareHeadingOf = (sheet: SheetDescriptor, community: string | null): ShareHeading => ({
  heading: headingOf(sheet),
  title: sheet.name ? COPY.communityName(sheet.name) : (sheet.recipe?.title ?? null),
  stars: sheet.spec.stars,
  community,
});

/** The plate's stamp row: the same seals as the footer's, a size up for the screenshot. */
const MARK_SIZE = 16;

/** The plate's four corner pieces, each the top-left fleuron turned a quarter further. */
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

/** A torn plate's top edge: how many deckle teeth, and how deep (px) they bite. */
const TORN_EDGE = Object.freeze({ teeth: 24, depth: 4 });
/** Room kept outside the clip for the plate's cast shadow, which the clip would otherwise cut. */
const SHADOW_ROOM = '48px';

/** The ragged top edge as a clip-path, seeded so it is the same on every render and every device. */
const TORN_CLIP = (() => {
  const top = deckle(TORN_EDGE.teeth, 'torn-plate').map(
    (jitter, i) => `${((i * 100) / TORN_EDGE.teeth).toFixed(2)}% ${(jitter * TORN_EDGE.depth).toFixed(2)}px`,
  );
  const outside = `calc(100% + ${SHADOW_ROOM})`;
  return `polygon(-${SHADOW_ROOM} ${TORN_EDGE.depth}px, ${top.join(', ')}, ${outside} ${TORN_EDGE.depth}px, ${outside} ${outside}, -${SHADOW_ROOM} ${outside})`;
})();

/**
 * The plate's colophon: the sheet by number, day and colourway, a trap by its
 * maker, or a practice sheet by its difficulty and recipe. Each part stays
 * whole on narrow screens; a line breaks only after a dot.
 */
const Colophon = ({ sheet }: { readonly sheet: SheetDescriptor }) => {
  const body = (() => {
    switch (sheet.kind) {
      case 'trap':
        return COPY.trap.by(sheet.author ?? 'someone');
      case 'daily':
        return (
          <>
            <span className="result__colophon-part">
              {COPY.result.sheet} <Numero /> <span className="figures">{sheet.number}</span> ·
            </span>{' '}
            <span className="result__colophon-part">{sheet.weekday} ·</span>{' '}
            <span className="result__colophon-part">{sheet.paletteName}</span>
          </>
        );
      case 'practice':
        return (
          <>
            <span className="result__colophon-part">{COPY.practice.eyebrow} ·</span>{' '}
            <span className="result__colophon-part">
              <span className="result__stars">
                <ToolStars count={sheet.spec.stars} label={COPY.stars(sheet.spec.stars)} />
              </span>
              {sheet.recipe ? ' ·' : null}
            </span>{' '}
            {sheet.recipe ? (
              <span className="result__colophon-part">
                <RecipeTitle recipe={sheet.recipe} />
              </span>
            ) : null}
          </>
        );
      default:
        return assertNever(sheet.kind);
    }
  })();
  return <p className="result__colophon label">{body}</p>;
};

/**
 * "Tomorrow, Tuesday ★★: an early fold, bent by three drops." A special day
 * names its rule too, since the rule is the news; a Sunday shows no stars,
 * because it may be a community trap of any difficulty.
 */
const Teaser = ({ preview }: { readonly preview: DayPreview }) => (
  <span className="result__tomorrow">
    {COPY.result.tomorrow(preview.weekday)}
    {preview.stars === null ? null : (
      <>
        {' '}
        <span className="result__stars">
          <ToolStars count={preview.stars} label={COPY.stars(preview.stars)} />
        </span>
      </>
    )}
    {preview.recipe?.special ? (
      <>
        {' · '}
        <span className="result__special">
          <RecipeTitle recipe={preview.recipe} />
        </span>
      </>
    ) : null}
    {COPY.result.tomorrowPromise(preview.promise)}
  </span>
);

const SHARE_LABEL: Record<ShareOutcome, string> = {
  shared: COPY.result.shared,
  copied: COPY.result.copied,
  failed: COPY.result.shareFailed,
};

/** The Apprentice's marks are a size down from the player's: theirs is the result, this a reference. */
const APPRENTICE_MARK_SIZE = 12;

/**
 * Before a few hands have played, the house reader stands in for everyone:
 * how the Apprentice, who only trusts the roundest drop, fared against you.
 * Never counted as a hand, and named as what it is.
 */
const ApprenticeReading = ({
  sheet,
  state,
  run,
}: {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly run: ApprenticeRun;
}) => {
  const marks = run.state.history.filter((h) => h.action.type !== 'magnify');
  return (
    <div className="result__apprentice">
      <p className="result__apprentice-line">{apprenticeLine(sheet, state, run)}</p>
      <p className="result__apprentice-marks" role="img" aria-label={COPY.apprentice.marksLabel(run.tears.length)}>
        <span className="label" aria-hidden>
          {COPY.apprentice.name}
        </span>
        <span className="result__marks" aria-hidden>
          {marks.map((m, i) => (
            <Seal key={i} state={m.verdict === 'correct' ? 'gilt' : 'split'} size={APPRENTICE_MARK_SIZE} />
          ))}
        </span>
      </p>
      <p className="result__apprentice-who">{COPY.apprentice.who}</p>
    </div>
  );
};

/**
 * Where everyone tore the sheet, and the move that caught the most, once
 * enough hands have played; until then, the Apprentice's reading.
 */
const CommunityScars = ({
  sheet,
  state,
  scars,
  apprentice,
}: {
  readonly sheet: SheetDescriptor;
  readonly state: SessionState;
  readonly scars: ScarMap;
  readonly apprentice: ApprenticeRun;
}) => {
  if (scars.hands < COMMUNITY.quietHands) return <ApprenticeReading sheet={sheet} state={state} run={apprentice} />;
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

/** After a practice sheet: another like it, other settings, or back to the day's real sheet. Nothing is shared or counted. */
const PracticeNext = ({ practice }: { readonly practice: PracticeActions }) => {
  useEffect(() => practice.prefetchAnother(), [practice]);
  return (
    <>
      <div className="result__primary">
        <div className="actions">
          <button type="button" className="button button--primary" onClick={practice.anotherPractice}>
            {COPY.practice.another}
          </button>
          <button type="button" className="button" onClick={practice.pickPractice}>
            {COPY.practice.change}
          </button>
        </div>
      </div>
      <div className="result__secondary">
        <button type="button" className="result__link" onClick={practice.today}>
          {COPY.goToToday}
        </button>
      </div>
    </>
  );
};

type SheetNextProps = Pick<
  Props,
  | 'sheet'
  | 'state'
  | 'player'
  | 'thread'
  | 'yourTrap'
  | 'nextTrap'
  | 'community'
  | 'onShare'
  | 'onPlay'
  | 'onCompose'
  | 'onOpenBook'
  | 'onOpenThread'
  | 'onJoin'
  | 'onLogin'
  | 'onFlair'
> & {
  readonly kind: 'daily' | 'trap';
  readonly onPractice: () => void;
};

/**
 * After a daily or a trap: sharing the result, beside one call to act (see
 * `nextSteps`); setting a trap in sight while it can still be done; the rest
 * under "More"; joining and signing in as quiet links. Once the result is
 * copied, a way to the thread to paste it in: the app never posts for anyone.
 */
const SheetNext = ({
  sheet,
  kind,
  state,
  player,
  thread,
  yourTrap,
  nextTrap,
  community,
  onShare,
  onPlay,
  onCompose,
  onOpenBook,
  onOpenThread,
  onJoin,
  onLogin,
  onFlair,
  onPractice,
}: SheetNextProps) => {
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const [flair, setFlair] = useState(player.flair);
  const isTrap = kind === 'trap';
  const steps = nextSteps({
    sheetKind: kind,
    signedIn: player.signedIn,
    trapToSpring: nextTrap !== null,
    trapSetToday: yourTrap?.setToday ?? false,
    thread: thread !== null,
    community: community !== null,
  });

  const share = async (): Promise<void> => {
    setShared(await onShare(shareLine(shareHeadingOf(sheet, community), state), thread?.postId ?? null));
  };

  const toggleFlair = (): void => {
    const next = !flair;
    setFlair(next);
    onFlair(next)
      .then(setFlair)
      .catch(() => setFlair(!next));
  };

  /** A step as a button: the one call to act, or set beside sharing. */
  const button = (step: CallStep, primary: boolean) => {
    const className = primary ? 'button button--primary' : 'button';
    switch (step) {
      case 'spring-trap':
        return nextTrap ? (
          <button key={step} type="button" className={className} onClick={() => onPlay(nextTrap.id)}>
            {COPY.result.spring(nextTrap.author ?? 'someone')}
            <span className="result__stars">
              <ToolStars count={nextTrap.spec.stars} label={COPY.stars(nextTrap.spec.stars)} />
            </span>
          </button>
        ) : null;
      case 'set-trap':
        return (
          <button key={step} type="button" className={className} onClick={onCompose}>
            <QuillIcon size={18} />
            {COPY.trap.set}
          </button>
        );
      case 'book':
        return (
          <button key={step} type="button" className={className} onClick={onOpenBook}>
            <BookIcon size={18} />
            {COPY.result.tryBook}
          </button>
        );
      default:
        return assertNever(step);
    }
  };

  /** A step under "More", or a quiet link. */
  const link = (step: LinkStep) => {
    switch (step) {
      case 'thread':
        return thread ? (
          <div key={step} className="result__thread">
            <button type="button" className="result__thread-button" onClick={() => onOpenThread(thread.url)}>
              {thread.naming && !isTrap
                ? COPY.result.nameIt
                : isTrap
                  ? COPY.result.tellMaker(sheet.author ?? 'someone')
                  : COPY.result.comments}
            </button>
            {thread.naming && !isTrap ? <p className="result__note">{COPY.result.nameHow}</p> : null}
          </div>
        ) : null;
      case 'book':
        return (
          <button key={step} type="button" className="result__link" onClick={onOpenBook}>
            {COPY.book.open}
          </button>
        );
      case 'practice':
        return (
          <button key={step} type="button" className="result__link" onClick={onPractice}>
            {COPY.practice.entry}
          </button>
        );
      case 'flair':
        return (
          <label key={step} className="result__flair">
            <input type="checkbox" checked={flair} onChange={toggleFlair} />
            <span>
              {COPY.flair.toggle}
              <small>{COPY.flair.note}</small>
            </span>
          </label>
        );
      case 'join':
        return community ? (
          <button key={step} type="button" className="result__link" onClick={onJoin}>
            {COPY.result.join(community)}
          </button>
        ) : null;
      case 'sign-in':
        return (
          <button key={step} type="button" className="result__link" onClick={onLogin}>
            {COPY.result.login}
          </button>
        );
      default:
        return assertNever(step);
    }
  };

  return (
    <>
      <div className="result__primary">
        <div className="actions">{button(steps.primary, true)}</div>
        <div className="actions">
          <button type="button" className="button" onClick={() => void share()}>
            {shared === 'shared' || shared === 'copied' ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
            {COPY.result.share}
          </button>
          {steps.secondary.map((step) => button(step, false))}
        </div>
        <p className="result__note" role="status">
          {shared ? SHARE_LABEL[shared] : isMixedSunday(sheet) ? COPY.trap.noneQualified : COPY.book.sundayRule}
        </p>
        {shared === 'copied' && thread ? (
          <button type="button" className="result__link result__paste" onClick={() => onOpenThread(thread.url)}>
            {COPY.result.pasteInThread}
          </button>
        ) : null}
      </div>

      {yourTrap && yourTrap.sheetId !== sheet.id ? (
        <p className="result__your-trap">{COPY.result.yourTrap(yourTrap.caught, yourTrap.hands)}</p>
      ) : null}

      {steps.more.length > 0 ? (
        <details className="result__more">
          <summary className="result__more-toggle">{COPY.result.more}</summary>
          <div className="result__more-body">{steps.more.map(link)}</div>
        </details>
      ) : null}

      {steps.quiet.length > 0 ? <div className="result__secondary">{steps.quiet.map(link)}</div> : null}
    </>
  );
};

/**
 * The single end card: what you did, how it compares, and the next steps:
 * share it, then one call to act (spring someone's trap, set your own, or an
 * earlier sheet), with the rest a tap further. Play, comment, join and flair
 * are always separate actions, never bundled. A practice sheet's card keeps
 * only the time, the marks and what comes next.
 */
export const ResultCard = ({
  sheet,
  state,
  standing,
  player,
  scars,
  apprentice,
  thread,
  yourTrap,
  nextTrap,
  nextSheetAt,
  tomorrow,
  community,
  onPlay,
  onCompose,
  onOpenBook,
  onShare,
  onOpenThread,
  onJoin,
  onLogin,
  onFlair,
  practice,
}: Props) => {
  const countdown = useCountdown();
  const isTrap = sheet.kind === 'trap';
  const marks = state.history.filter((h) => h.action.type !== 'magnify');
  // The next daily, whatever sheet this is (an old one from the Book, a trap, practice).
  // Without an announcement, the weekly template stands in; practice, made offline, shows none.
  const preview = tomorrow ?? (sheet.kind === 'practice' ? null : templatePreview(dateKeyOf(nextSheetAt)));
  const duration = standing?.result.durationMs ?? state.history[state.history.length - 1]?.at ?? 0;

  return (
    <section className="result" aria-label="Result">
      <article
        className="result__plate"
        data-tone={state.status}
        style={state.status === 'torn' ? { clipPath: TORN_CLIP } : undefined}
      >
        {CORNERS.map((corner) => (
          <span key={corner} className="result__corner" data-corner={corner}>
            <Fleuron />
          </span>
        ))}

        <header className="result__head">
          <h2 className="result__headline" data-tone={state.status}>
            {headlineOf(state, standing)}
          </h2>
          <Fillet />
          <Colophon sheet={sheet} />
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
            <dd>{formatDuration(duration)}</dd>
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

        <p className="result__marks" role="img" aria-label={`${marks.length} actions`}>
          {marks.map((m, i) => (
            <Seal key={i} state={m.verdict === 'correct' ? 'gilt' : 'split'} size={MARK_SIZE} />
          ))}
          {state.magnified ? (
            <span className="result__lens">
              <Seal state="lens" size={MARK_SIZE} />
            </span>
          ) : null}
        </p>

        {scars ? <CommunityScars sheet={sheet} state={state} scars={scars} apprentice={apprentice} /> : null}
      </article>

      <div className="result__after">
        {(() => {
          switch (sheet.kind) {
            case 'practice':
              return <PracticeNext practice={practice} />;
            case 'daily':
            case 'trap':
              return (
                <SheetNext
                  sheet={sheet}
                  kind={sheet.kind}
                  state={state}
                  player={player}
                  thread={thread}
                  yourTrap={yourTrap}
                  nextTrap={nextTrap}
                  community={community}
                  onShare={onShare}
                  onPlay={onPlay}
                  onCompose={onCompose}
                  onOpenBook={onOpenBook}
                  onOpenThread={onOpenThread}
                  onJoin={onJoin}
                  onLogin={onLogin}
                  onFlair={onFlair}
                  onPractice={practice.pickPractice}
                />
              );
            default:
              return assertNever(sheet.kind);
          }
        })()}

        <footer className="result__next">
          <span className="label">{COPY.result.next}</span>
          <span className="figures result__countdown">{countdown}</span>
          {preview ? <Teaser preview={preview} /> : null}
        </footer>
      </div>
    </section>
  );
};
