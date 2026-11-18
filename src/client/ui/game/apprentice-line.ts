import { compareWithApprentice, type ApprenticeRun } from '../../../shared/game/apprentice.ts';
import type { SessionState } from '../../../shared/game/session.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { assertNever } from '../../lib/assert-never.ts';
import { COPY } from '../copy.ts';

/**
 * One line setting the player's reading against the Apprentice's, about the
 * tear that tells the most. It names the move the sheet outlines in dots.
 */
export const apprenticeLine = (sheet: SheetDescriptor, state: SessionState, run: ApprenticeRun): string => {
  const comparison = compareWithApprentice(state, run);
  if (comparison.kind === 'unfooled') return sheet.recipe?.special === 'ink-only' ? COPY.apprentice.restDay : COPY.apprentice.unfooled;
  const { step, fellFor, missed, missedKind } = comparison.tear;
  const fell = COPY.apprentice.fellFor(step, missedKind, fellFor !== missed);
  switch (comparison.kind) {
    case 'outread':
      return COPY.apprentice.outread(fell);
    case 'both-tore':
      return COPY.apprentice.bothTore(fell);
    case 'unreached':
      return COPY.apprentice.unreached(fell);
    default:
      return assertNever(comparison);
  }
};
