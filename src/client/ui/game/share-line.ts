import { isPerfect, marksOf, resultOf } from '../../../shared/game/scoring.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { assertNever } from '../../lib/assert-never.ts';
import { COPY } from '../copy.ts';

/** What a shared result says about its sheet, beyond the marks. */
export type ShareHeading = {
  /** "No.12 · Saturday", or "· a trap by u/someone". */
  readonly heading: string;
  /** What the sheet goes by: its community name in quotes, else its recipe's title; null for neither. */
  readonly title: string | null;
  readonly stars: number;
  /** The subreddit it is played in, or null outside Reddit. */
  readonly community: string | null;
};

const WORDS = COPY.result.shareText;

/** How the sheet names itself when shared: its number, its maker for a trap, or that it is practice. */
const headingOf = (sheet: SheetDescriptor): string => {
  switch (sheet.kind) {
    case 'trap':
      return WORDS.trap(sheet.author ?? 'someone');
    case 'daily':
      return WORDS.daily(sheet.number, sheet.weekday);
    case 'practice':
      return WORDS.practice(COPY.practice.eyebrow);
    default:
      return assertNever(sheet.kind);
  }
};

/** What a shared result says about `sheet`: what it goes by, and the subreddit it is played in. */
export const shareHeadingOf = (sheet: SheetDescriptor, community: string | null): ShareHeading => ({
  heading: headingOf(sheet),
  title: sheet.name ? COPY.communityName(sheet.name) : (sheet.recipe?.title ?? null),
  stars: sheet.spec.stars,
  community,
});

const formatTime = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * Spoiler-free text a player can paste in a comment, in three lines: the
 * sheet, one mark per action, then the outcome, the time and where it is
 * played. Marks only, never the kinds of moves.
 */
export const shareLine = (sheet: ShareHeading, state: SessionState): string => {
  const result = resultOf(state);
  const outcome = !result.clean
    ? WORDS.torn
    : isPerfect(result)
      ? WORDS.seal
      : result.blots === 0
        ? WORDS.clean
        : WORDS.tears(result.blots);
  const lens = result.magnified ? ' ◐' : '';
  const head = [`${WORDS.brand} ${sheet.heading} ${'★'.repeat(sheet.stars)}`, sheet.title].filter(Boolean).join(' · ');
  const foot = [outcome, formatTime(result.durationMs), sheet.community ? WORDS.community(sheet.community) : null]
    .filter(Boolean)
    .join(' · ');
  return [head, `${marksOf(state)}${lens}`, foot].join('\n');
};
