import { useMemo } from 'react';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import type { LoggedAction } from '../../../shared/protocol/api.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import type { SoundBank } from '../../audio/sound.ts';
import { GameController, type AttemptSink } from '../../game/controller.ts';
import { localPrefs } from '../../lib/local-prefs.ts';
import { prefersReducedMotion } from '../hooks/use-store.ts';

export type GameSetup = {
  /** Identifies one attempt: a new key starts a fresh controller. */
  readonly key: string;
  readonly spec: SheetSpec;
  readonly log: readonly LoggedAction[];
  readonly sink: AttemptSink;
  /** Whether contextual hints may appear (off during lessons). */
  readonly hints: boolean;
};

/** Overlay ink: the colour of a pen line on paper, independent of theme. */
const OVERLAY_INK = '#1F1A14';

const createController = (setup: GameSetup, sound: SoundBank): GameController => {
  const palette = getPalette(setup.spec.paletteId);
  return new GameController({
    spec: setup.spec,
    log: setup.log,
    sink: setup.sink,
    sound,
    reducedMotion: prefersReducedMotion,
    colors: () => ({ ink: OVERLAY_INK, paper: palette.paper, accent: OVERLAY_INK }),
    hints: setup.hints ? localPrefs : null,
  });
};

/**
 * One controller per attempt. Construction is side-effect free (drawing
 * starts on attach), so memoising on the attempt key is safe.
 */
export const useGame = (setup: GameSetup, sound: SoundBank): GameController =>
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key fully identifies spec, log and sink
  useMemo(() => createController(setup, sound), [setup.key, sound]);

/** An attempt that is not recorded anywhere (lessons). */
export const NOWHERE: AttemptSink = { record: async () => null };
