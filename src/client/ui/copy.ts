import type { BlotReason } from '../../shared/game/explain.ts';
import type { MoveKind } from '../../shared/puzzle/moves.ts';

const FORM_NAMES: Record<MoveKind, string> = { drop: 'drop', stroke: 'fold', swirl: 'swirl' };

/**
 * Every word the player reads, in one place. Written by hand, kept short:
 * one line per moment, never a wall of text.
 */
export const COPY = Object.freeze({
  wordmark: 'Unmarble',
  tagline: 'Every sheet remembers how it was made.',
  dailyPrompt: 'Undo the sheet, last move first.',
  cardQuestion: 'Which drop fell last?',
  cardPlay: 'Unmarble today’s sheet',
  cardResume: 'Continue today’s sheet',
  cardDone: 'See today’s result',
  cardSampleRight: 'Yes — the round one fell last.',
  cardSampleWrong: 'Look again: only one is perfectly round.',
  cardSamplePrompt: 'Tap it.',
  cardHeroHint: 'Tap to unmarble',
  /** A name the community gave a sheet, set apart from the colourway's name. */
  communityName: (name: string) => `“${name}”`,
  cardHands: (hands: number) => `${hands} ${hands === 1 ? 'hand has' : 'hands have'} worked this sheet`,
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  lessonsDone: 'Now today’s sheet.',
  warmUp: {
    note: (stars: number) => `Today’s sheet is ${'★'.repeat(stars)}. New here? Warm up on an easier one first.`,
    action: (weekday: string) => `Warm up on ${weekday}’s sheet`,
    dismiss: 'Take on today’s',
  },
  skipLessons: 'Skip',
  lens: 'Lens',
  lensUsed: 'Lens used',
  sound: 'Sound',
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
    cleanWithBlots: (blots: number) => `Clean, with ${blots} ${blots === 1 ? 'tear' : 'tears'}.`,
    rank: (rank: number, hands: number) => `${ordinal(rank)} of ${hands} ${hands === 1 ? 'hand' : 'hands'}`,
    /** While only a few have played, a rank says nothing: say how early they are instead. */
    early: (hands: number) => (hands <= 1 ? 'The first hand on this sheet' : `One of the first ${hands} hands`),
    streak: (days: number) => `${days}-day streak`,
    next: 'Next sheet in',
    /** Stars only when they are certain (a Sunday may be a community trap of any difficulty). */
    tomorrow: (weekday: string, stars: number | null, promise: string) =>
      `Tomorrow, ${weekday}${stars === null ? '' : ` ${'★'.repeat(stars)}`}: ${promise}.`,
    share: 'Share result',
    shared: 'Ready to share',
    copied: 'Copied — paste it in the comments',
    shareFailed: 'Could not share. Try again.',
    join: (community: string) => `Join r/${community}`,
    login: 'Sign in to set traps and show your streak',
    nameIt: 'Name this sheet',
    nameHow: 'Reply to the pinned comment with a name of up to three words. The best-voted one sticks.',
    comments: 'See what others made of it',
    tellMaker: (author: string) => `Tell u/${author} how it went`,
    scars: (hands: number) => `Where hands tore it · ${hands} hands so far`,
    scarsQuiet: 'Everyone’s tears will show on the sheet once a few more hands have played.',
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
    sundayRule: 'The week’s best fair trap becomes Sunday’s sheet.',
    label: 'Book',
    hands: (n: number) => `${n} ${n === 1 ? 'hand' : 'hands'}`,
    status: { unplayed: 'Not played', playing: 'In progress', clean: 'Clean', torn: 'Torn' },
    open: 'Open the Book',
    back: 'Back',
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
    publishedNote: 'Everyone in the subreddit can now try it. Its post keeps count of who it catches, and the week’s best fair trap becomes Sunday’s sheet.',
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
    next: (author: string) => `Next: a trap by u/${author}`,
    cardPlay: 'Spring the trap',
  },
  flair: {
    toggle: 'Show my streak as flair',
    note: 'Shown next to your name here. Untick to get your old flair back.',
  },
  oldSheet: 'This is an earlier sheet.',
  goToToday: 'Today’s sheet',
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
