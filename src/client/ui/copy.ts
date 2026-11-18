import type { BlotReason } from '../../shared/game/explain.ts';
import type { MoveKind } from '../../shared/puzzle/moves.ts';
import type { Reading } from '../../shared/puzzle/tutorial.ts';

const FORM_NAMES: Record<MoveKind, string> = { drop: 'drop', stroke: 'fold', swirl: 'swirl' };

/** How Sunday's trap is chosen, said the same wherever it is said. */
const SUNDAY_RULE = 'The week’s most-played trap becomes Sunday’s sheet, if enough signed-in players tried it and it is neither too easy nor too hard.';

/**
 * Every word the player reads, in one place. Written by hand, kept short:
 * one line per moment, never a wall of text.
 */
export const COPY = Object.freeze({
  wordmark: 'Unmarble',
  tagline: 'Every sheet remembers how it was made.',
  dailyPrompt: 'Undo the sheet, last move first.',
  /** A special day opens on its rule instead: "Ink Only: a rest day: six drops, nothing else." */
  specialPrompt: (title: string, promise: string) => `${title}: ${promise}.`,
  /** How a special day's gilt mark is read aloud. */
  specialDay: 'special day',
  cardQuestion: 'Which drop fell last?',
  cardPlay: 'Unmarble today’s sheet',
  cardResume: 'Continue today’s sheet',
  cardDone: 'See today’s result',
  cardSampleRight: 'Yes — the round one fell last.',
  cardSampleWrong: 'Look again: only one is perfectly round.',
  cardSamplePrompt: 'Tap it.',
  cardHeroHint: 'Tap to unmarble',
  /** Over the plaque on the pinned hub post, which always shows today's sheet. */
  atelierEyebrow: 'The Atelier · today’s sheet',
  /** A name the community gave a sheet, set apart from the colourway's name. */
  communityName: (name: string) => `“${name}”`,
  cardHands: (hands: number) => `${hands} ${hands === 1 ? 'hand has' : 'hands have'} worked this sheet`,
  /** Before anyone has played, the card says what the sheet asks: "An early fold, bent by two drops." */
  cardPromise: (promise: string) =>
    `${promise.charAt(0).toUpperCase()}${promise.slice(1)}${/[.?!]$/.test(promise) ? '' : '.'}`,
  /** The plaque's title while lessons come before the first sheet. */
  lessonsTitle: 'First sheets',
  /** Beside the lesson dots on the plaque. */
  lessonDotsLabel: 'Lessons',
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  warmUp: {
    note: (stars: number) => `Today’s sheet is ${'★'.repeat(stars)}. New here? Warm up on an easier one first.`,
    action: (weekday: string) => `Warm up on ${weekday}’s sheet`,
    dismiss: 'Take on today’s',
  },
  skipLesson: 'Skip',
  /** The skip button read aloud: it skips the lesson on screen, not the rest. */
  skipLessonLabel: (n: number, total: number) => `Skip lesson ${n} of ${total}`,
  lens: 'Lens',
  lensUsed: 'Lens used',
  sound: 'Sound',
  /** How "Nº" is read aloud. */
  number: 'Number',
  /** How a row of tooled stars is read aloud. */
  stars: (stars: number) => `${stars} ${stars === 1 ? 'star' : 'stars'}`,
  close: 'Close',
  retry: 'Try again',
  sealsLabel: (done: number, total: number) => `${done} of ${total} moves undone`,
  blotsLabel: (left: number) => `${left} ${left === 1 ? 'tear' : 'tears'} before the sheet gives way`,
  miss: 'Only water there.',
  correct: ['Back into the water.', 'The paper relaxes.', 'Undone.', 'Gone without a trace.'],
  blot: {
    bent: 'Torn. That drop is pushed out of round — something fell after it.',
    ring: 'Torn. Later ink fell inside that drop.',
    'seam-bent': 'Torn. That fold is bent — something crossed it later.',
    'with-the-grain': 'Torn. Right fold, wrong way: drag against its point.',
    'eye-bent': 'Torn. That swirl’s eye is pushed out of round — something came after it.',
    'with-the-turn': 'Torn. Right swirl, wrong way: circle against its turn.',
  } satisfies Record<BlotReason, string>,
  hintRound: 'Look for the one drop that is perfectly round.',
  hintSeam: 'Nothing perfectly round? Something stroked the water. Find the fold.',
  hintSwirl: 'Nothing round, no straight fold? Look for the eye of a swirl and circle it back.',
  hintLens: 'Stuck? The lens shows where the water moved.',
  replayStep: (step: number, total: number) => `How it was made · ${step} of ${total}`,
  result: {
    perfect: 'Perfect.',
    clean: 'Clean.',
    torn: 'Torn.',
    /** The bookplate's colophon opens "Sheet Nº 11". */
    sheet: 'Sheet',
    cleanWithBlots: (blots: number) => `Clean, with ${blots} ${blots === 1 ? 'tear' : 'tears'}.`,
    rank: (rank: number, hands: number) => `${ordinal(rank)} of ${hands} ${hands === 1 ? 'hand' : 'hands'}`,
    /** While only a few have played, a rank says nothing: say how early they are instead. */
    early: (hands: number) => (hands <= 1 ? 'The first hand on this sheet' : `One of the first ${hands} hands`),
    streak: (days: number) => `${days}-day streak`,
    next: 'Next sheet in',
    /** "Tomorrow, Tuesday", then its stars as tooled marks (when certain), then ": what it asks." */
    tomorrow: (weekday: string) => `Tomorrow, ${weekday}`,
    tomorrowPromise: (promise: string) => `: ${promise}.`,
    share: 'Share result',
    shared: 'Ready to share',
    /** Copied, with a way to the thread shown beside it. */
    copied: 'Copied.',
    /** Copied where no thread can be linked: where it goes is said instead. */
    copiedNoThread: 'Copied — paste it in the comments',
    /** After copying: a way to the sheet's post. The app never posts for the player. */
    pasteInThread: 'Paste it in the thread',
    /** The words of a shared result (see share-line.ts): spoiler-free, marks only, never the kinds of moves. */
    shareText: {
      brand: 'UNMARBLE',
      daily: (number: number, weekday: string) => `No.${number} · ${weekday}`,
      trap: (author: string) => `· a trap by u/${author}`,
      practice: (label: string) => `· ${label}`,
      torn: 'torn',
      clean: 'clean',
      tears: (tears: number) => `${tears} ${tears === 1 ? 'tear' : 'tears'}`,
      /** Earned by a clean sheet with no tear and no Lens. */
      seal: '⛨ clean, no Lens',
      community: (community: string) => `r/${community}`,
    },
    shareFailed: 'Could not share. Try again.',
    join: (community: string) => `Join r/${community}`,
    /** The one call to act, when someone else's trap is waiting. */
    spring: (author: string) => `Spring u/${author}’s trap`,
    /** The call to act once there is no trap to spring or set. */
    tryBook: 'Try a sheet from the Book',
    /** Opens the rest of the next steps. */
    more: 'More',
    login: 'Sign in to set traps and show your streak',
    nameIt: 'Name this sheet',
    nameHow: 'Reply to the pinned comment with a name of up to three words. The best-voted one sticks.',
    comments: 'See what others made of it',
    tellMaker: (author: string) => `Tell u/${author} how it went`,
    scars: (hands: number) => `Where hands tore it · ${hands} hands so far`,
    caughtOn: (share: number, form: MoveKind) => `${Math.round(share * 100)}% tore on this ${FORM_NAMES[form]}`,
    yourTrap: (caught: number, hands: number) =>
      hands === 0 ? 'Your trap is set. No one has sprung it yet.' : `Your trap has caught ${caught} of ${hands} ${hands === 1 ? 'hand' : 'hands'}.`,
  },
  book: {
    title: 'The Book',
    eyebrow: 'Every sheet so far',
    dailies: 'Daily sheets',
    traps: 'Traps',
    noTraps: 'No traps yet. Set the first one on today’s paper.',
    beFirst: 'No hands yet — be the first',
    inTheRunning: 'In the running for Sunday',
    sundayRule: SUNDAY_RULE,
    label: 'Book',
    hands: (n: number) => `${n} ${n === 1 ? 'hand' : 'hands'}`,
    status: { unplayed: 'Not played', playing: 'In progress', clean: 'Clean', torn: 'Torn' },
    open: 'Open the Book',
    back: 'Back',
    /** A running head over each week of sheets; `monday` is already written out ("16 November"). */
    weekOf: (monday: string) => `Week of ${monday}`,
    today: 'Today',
  },
  trap: {
    by: (author: string) => `A trap by u/${author}`,
    sheetOfWeek: (author: string) => `Sheet of the week, set by u/${author}`,
    title: 'Trap',
    set: 'Set a trap',
    composeTitle: 'Set a trap',
    composeEyebrow: 'On today’s paper',
    tools: { drop: 'Drop', fold: 'Fold', swirl: 'Swirl' },
    toolHints: {
      drop: 'Tap the paper to let a drop fall.',
      fold: 'Drag across the paper to draw a fold.',
      swirl: 'Tap where the eye of the swirl should be.',
    },
    turn: { 1: 'Turn one way', [-1]: 'Turn the other way' },
    undo: 'Undo',
    publish: 'Set this trap',
    signIn: 'Sign in to set traps',
    publishing: 'Setting…',
    published: 'Your trap is set.',
    publishedNote: `Everyone in the subreddit can now try it. Its post keeps count of who it catches. ${SUNDAY_RULE}`,
    seePost: 'See it in the feed',
    backToSheet: 'Back to today’s sheet',
    ready: (stars: number, moves: number) => `Fair. ${'★'.repeat(stars)} · ${moves} moves — ready to set.`,
    devious: 'Devious: it fools anyone who trusts the roundest drop.',
    plain: 'Fair, but plain: no drop pretends to be the last one yet.',
    sundayRule: 'Fair traps that catch people can become Sunday’s sheet.',
    problems: {
      'too-few': 'Add at least 3 moves.',
      'too-many': 'Seven moves at most.',
      'starts-bare': 'Start with a drop: bare water shows nothing.',
      'off-sheet': (move: number) => `Move ${move} is too close to the edge.`,
      'merged-ink': (move: number) => `Drop ${move} fell inside a drop of the same ink. Use another ink, or move it.`,
      'short-fold': (move: number) => `Fold ${move} only clips a corner. Run it across more of the paper.`,
      'shallow-fold': (move: number) => `Fold ${move} runs along the stripes and leaves no kink. Cross them.`,
      'hidden-order': (move: number) => `Move ${move} leaves no readable trace. Put what comes next closer to it.`,
      'faint-ink': (move: number) => `Drop ${move} gets squeezed too thin to tap.`,
      'ambiguous-gesture': (move: number) => `Move ${move} could be mistaken for another when undone. Give it room.`,
    },
    rejected: {
      invalid: 'That trap could not be read. Try again.',
      unfair: 'That trap is not fair yet.',
      'signed-out': 'Sign in to set a trap: traps carry their maker’s name.',
      'daily-limit': 'You have already set a trap today. Come back tomorrow.',
      banned: 'You can’t set traps in this community.',
    },
    caught: (caught: number, hands: number) => `Caught ${caught} of ${hands} ${hands === 1 ? 'hand' : 'hands'}`,
    sawThrough: 'You saw through it.',
    gotCaught: 'It caught you.',
    cardPlay: 'Spring the trap',
    /** On a trap's card before anyone has tried it. */
    beFirst: 'Be the first to spring it',
    /** A Sunday without a featured trap says why. */
    noneQualified: 'No trap qualified this week. Set one for next Sunday.',
  },
  /**
   * The house reader, a bot that only trusts the roundest drop. Always "the
   * Apprentice", never a hand or a player. Before play it says only how often
   * it is fooled, never where.
   */
  apprentice: {
    name: 'The Apprentice',
    fools: (times: number) => `Fools the Apprentice ${times}×`,
    /** When it is fooled so often that the sheet gives way under it. */
    tears: 'Tears the sheet under the Apprentice',
    marksLabel: (tears: number) =>
      tears === 0 ? 'The Apprentice’s marks: no tears' : `The Apprentice’s marks: ${tears} ${tears === 1 ? 'tear' : 'tears'}`,
    /**
     * The move it fell for, which the sheet outlines in dots: a drop it
     * trusted while another move lay on top, or the top move itself, undone
     * with its grain when no drop was left.
     */
    fellFor: (step: number, missed: MoveKind, trustedDrop: boolean) =>
      trustedDrop
        ? `On move ${step} the Apprentice trusted the dotted drop, but ${missed === 'drop' ? 'another drop' : `a ${FORM_NAMES[missed]}`} lay on top`
        : `On move ${step} the Apprentice undid the dotted ${FORM_NAMES[missed]} the wrong way`,
    outread: (fell: string) => `${fell}. You read it right.`,
    bothTore: (fell: string) => `${fell}. You tore there too.`,
    unreached: (fell: string) => `${fell}. Your sheet had given way before.`,
    restDay: 'Even the Apprentice reads a rest day.',
    unfooled: 'Even the Apprentice reads this one: no drop pretends to have fallen last.',
    who: 'The house reader: it only trusts the roundest drop.',
  },
  flair: {
    toggle: 'Show my streak as flair',
    note: 'Shown next to your name here. Untick to get your old flair back.',
  },
  /**
   * The pocket reading guide: the rule, the lessons as specimens to play
   * again, and a map of everything else the app offers.
   */
  guide: {
    open: 'Reading guide',
    /** Why the "?" waits: it opens only while the clock has nothing to answer for. */
    unavailable: 'The guide opens before your first move, or once the sheet is done.',
    title: 'Reading guide',
    rule: 'Every sheet is read backwards: undo the move that came last, then the one before it, until the stripes run straight.',
    readingsHead: 'The readings',
    readings: { drop: 'Drops', stroke: 'Folds', swirl: 'Swirls', twins: 'Twins' } satisfies Record<Reading, string>,
    /** How each specimen is read aloud: "Specimen: Folds". */
    specimen: (title: string) => `Specimen: ${title}`,
    right: 'Undone.',
    solved: 'Bare water again.',
    wrong: 'Not that one: something came after it.',
    wrongWay: 'Right one, wrong way: go against it.',
    again: 'Again',
    exact: 'Every mark UNMARBLE uses can be undone exactly.',
    hereHead: 'What’s here',
    here: {
      trap: {
        title: 'Set a trap',
        note: 'Marble a sheet of your own on today’s paper, to catch other players. It is checked for fairness first.',
        action: 'Set a trap',
      },
      sunday: {
        title: 'Sunday’s trap',
        note: `${SUNDAY_RULE} It is credited to its maker, and the Book marks the one in the running.`,
        action: 'See the traps',
      },
      name: {
        title: 'Name the sheet',
        note: 'Each daily post’s pinned comment asks what the sheet looks like. Once it has enough upvotes, the best-voted reply of up to three words names it.',
        action: 'Open the thread',
      },
      book: {
        title: 'The Book',
        note: 'The last month of daily sheets and the newest traps, each with your result. Old sheets stay playable.',
        action: 'Open the Book',
      },
      practice: {
        title: 'Practice',
        note: 'As many sheets as you like, marbled on your device. Unranked, no streak.',
        action: 'Practice sheets',
      },
    },
  },
  oldSheet: 'This is an earlier sheet.',
  goToToday: 'Today’s sheet',
  loading: 'Laying out the sheet…',
  loadFailed: 'The bath is unsettled. Try again in a moment.',
  practice: {
    /** Over the plaque, and the colophon's first word. */
    eyebrow: 'Practice',
    /** The way in, from a result card. */
    entry: 'Practice sheets · unlimited, unranked',
    /** The way in, from the Book. */
    open: 'Practice',
    title: 'Practice sheets',
    pickerEyebrow: 'Unlimited · unranked',
    lead: 'Marbled on your device, as many as you like. No rank, no streak.',
    difficulty: 'Difficulty',
    recipe: 'Recipe',
    /** Under each difficulty: the weekdays that have it ("Thursdays · Sundays"). */
    days: (weekdays: readonly string[]) => weekdays.map((day) => `${day}s`).join(' · '),
    anyRecipe: 'Any recipe',
    anyPromise: 'one of its recipes, drawn at random',
    marble: 'Marble a sheet',
    marbling: 'Marbling a practice sheet…',
    failed: 'Couldn’t marble a sheet. Try again',
    banner: 'Practice sheet: unranked, no streak.',
    another: 'Another',
    change: 'Change',
    warmUp: 'Warm up on a ★ practice sheet',
  },
});

export const blotLine = (reason: BlotReason | null): string =>
  reason ? COPY.blot[reason] : 'Torn. Something fell on that one after.';

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
