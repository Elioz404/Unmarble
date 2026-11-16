import type { BlotReason } from '../../shared/game/explain.ts';

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
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  lessonsDone: 'Now today’s sheet.',
  skipLessons: 'Skip',
  lens: 'Lens',
  lensUsed: 'Lens used',
  sound: 'Sound',
  close: 'Close',
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
    streak: (days: number) => `${days}-day streak`,
    next: 'Next sheet in',
    tomorrow: (palette: string) => `Tomorrow: ${palette}`,
    copy: 'Copy result',
    copied: 'Copied',
    subscribe: 'Join the bindery',
    subscribed: 'Joined',
    login: 'Sign in to keep your streak',
    nameIt: 'What does this sheet look like? Name it in the comments.',
    scars: 'Where hands tore it today',
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
