import { COMMUNITY } from '../../../shared/config.ts';
import type { ApprenticeRun } from '../../../shared/game/apprentice.ts';
import { isMixedSunday } from '../../../shared/puzzle/daily.ts';
import type { SheetDescriptor, SheetStats } from '../../../shared/protocol/api.ts';
import { COPY } from '../copy.ts';

/** Before anyone has played: what the sheet asks (or why a Sunday is mixed), a trap's invitation, or the motto. */
const untouchedLine = (sheet: SheetDescriptor): string => {
  if (sheet.kind === 'trap') return COPY.trap.beFirst;
  if (isMixedSunday(sheet)) return COPY.trap.noneQualified;
  return sheet.recipe ? COPY.cardPromise(sheet.recipe.promise) : COPY.tagline;
};

/** How the sheet has fared: how a trap is catching people, or how many have played. */
const playedLine = (sheet: SheetDescriptor, stats: SheetStats): string =>
  sheet.kind === 'trap' && stats.hands >= COMMUNITY.quietHands
    ? COPY.trap.caught(stats.caught, stats.hands)
    : COPY.cardHands(stats.hands);

/** How often the Apprentice is fooled, a count only and never which move; null when it never is. */
const apprenticeNote = (run: ApprenticeRun): string | null => {
  if (run.state.status === 'torn') return COPY.apprentice.tears;
  return run.tears.length > 0 ? COPY.apprentice.fools(run.tears.length) : null;
};

/**
 * The line under the card's button. Until the stats arrive nothing is claimed
 * about who has played: the motto shows. While the sheet is quiet, the line
 * also says how the Apprentice fares on it.
 */
export const metaLine = (sheet: SheetDescriptor, stats: SheetStats | null, apprentice: ApprenticeRun): string => {
  if (!stats) return COPY.tagline;
  const fared = stats.hands === 0 ? untouchedLine(sheet) : playedLine(sheet, stats);
  const note = stats.hands < COMMUNITY.quietHands ? apprenticeNote(apprentice) : null;
  return note ? `${note} · ${fared}` : fared;
};
