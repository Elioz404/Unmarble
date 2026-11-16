import { useMemo } from 'react';
import type { SheetSpec } from '../../../shared/puzzle/sheet.ts';
import type { LoggedAction, Standing } from '../../../shared/protocol/api.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import type { SoundBank } from '../../audio/sound.ts';
import type { AttemptSink } from '../../game/attempt-sink.ts';
import { GameController } from '../../game/controller.ts';
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
  /** Standing already known for a finished attempt. */
  readonly standing: Standing | null;
};

/** Overlay colours are paper colours: independent of the app's light or dark theme. */
const OVERLAY_INK = '#1F1A14';
const OVERLAY_BLOT = '#8E3328';

const createController = (setup: GameSetup, sound: SoundBank): GameController => {
  const palette = getPalette(setup.spec.paletteId);
  return new GameController({
    spec: setup.spec,
    log: setup.log,
    sink: setup.sink,
    sound,
    reducedMotion: prefersReducedMotion,
    colors: () => ({ ink: OVERLAY_INK, paper: palette.paper, accent: OVERLAY_INK, blot: OVERLAY_BLOT }),
    hints: setup.hints ? localPrefs : null,
    standing: setup.standing,
  });
};

/**
 * One controller per attempt. Construction is side-effect free (drawing
 * starts on attach), so memoising on the attempt key is safe.
 */
export const useGame = (setup: GameSetup, sound: SoundBank): GameController =>
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key fully identifies spec, log and sink
  useMemo(() => createController(setup, sound), [setup.key, sound]);

