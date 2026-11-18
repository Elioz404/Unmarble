import type { BookEntry, SheetDescriptor } from '../../../shared/protocol/api.ts';

/**
 * Everything a finished daily or trap can lead to. Sharing is not among them:
 * it is the result itself, always beside the primary step.
 */
export type NextStep =
  /** Someone else's trap, not tried yet. */
  | 'spring-trap'
  /** Today's trap, the player's one a day. */
  | 'set-trap'
  /** An earlier sheet from the Book. */
  | 'book'
  /** The sheet's own post: to name it, or tell its maker how it went. */
  | 'thread'
  | 'practice'
  | 'flair'
  /** The subreddit's page, where Reddit's own Join button is. */
  | 'join'
  | 'sign-in';

/** The steps that can be a call to act, shown as buttons. */
export type CallStep = Extract<NextStep, 'spring-trap' | 'set-trap' | 'book'>;
/** The steps shown under "More" or as quiet links. */
export type LinkStep = Exclude<NextStep, 'spring-trap' | 'set-trap'>;

/**
 * The result card's steps, by weight: one primary, what stays beside it, the
 * rest behind "More", and quiet links. While the Book is still being read, no
 * call to act is known yet (`primary` null, nothing beside it), so none can
 * change under a finger.
 */
export type NextSteps = {
  readonly primary: CallStep | null;
  readonly secondary: readonly CallStep[];
  readonly more: readonly LinkStep[];
  readonly quiet: readonly LinkStep[];
};

export type NextStepsInput = {
  readonly sheetKind: 'daily' | 'trap';
  readonly signedIn: boolean;
  /** Whether someone else's trap is there to spring; null while the Book is still being read. */
  readonly trapToSpring: boolean | null;
  /** Whether the player has already set today's trap. */
  readonly trapSetToday: boolean;
  /** Whether the sheet has a post to go to. */
  readonly thread: boolean;
  /** Whether there is a subreddit to join (none in the lab). */
  readonly community: boolean;
};

/** The candidates that apply, in order (`false` for one that does not). */
const steps = <T extends NextStep>(candidates: readonly (T | false)[]): T[] =>
  candidates.filter((step): step is T => step !== false);

/**
 * One call to act after a sheet: spring someone's trap if there is one, else
 * set your own while you still can today, else try a sheet from the Book.
 * Setting a trap stays in sight whenever it is still possible (signed out,
 * the editor asks for sign-in); everything else waits under "More", and
 * joining is a quiet link.
 */
export const nextSteps = (input: NextStepsInput): NextSteps => {
  const canSetTrap = input.signedIn && !input.trapSetToday;
  const primary: CallStep | null =
    input.trapToSpring === null ? null : input.trapToSpring ? 'spring-trap' : canSetTrap ? 'set-trap' : 'book';
  return {
    primary,
    secondary: steps<CallStep>([primary !== null && primary !== 'set-trap' && !input.trapSetToday && 'set-trap']),
    more: steps<LinkStep>([
      input.thread && 'thread',
      primary !== 'book' && 'book',
      'practice',
      input.signedIn && input.sheetKind === 'daily' && 'flair',
    ]),
    quiet: steps<LinkStep>([input.community && 'join', !input.signedIn && 'sign-in']),
  };
};

/**
 * The trap to offer next: the newest one the player has not tried, other than
 * the sheet just finished, and never one of their own (as the server marks it).
 */
export const trapToSpring = (traps: readonly BookEntry[], finishedId: string): SheetDescriptor | null =>
  traps.find((entry) => entry.status === 'unplayed' && !entry.mine && entry.sheet.id !== finishedId)?.sheet ?? null;
