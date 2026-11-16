import { useMemo, useRef, type MouseEvent } from 'react';
import { COMMUNITY } from '../../../shared/config.ts';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import type { SheetDescriptor, SheetStats } from '../../../shared/protocol/api.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { COPY } from '../copy.ts';
import { SheetPlaque } from '../game/Chrome.tsx';
import { SampleQuestion } from './SampleQuestion.tsx';
import { useCpuSheet } from './use-cpu-sheet.ts';
import './feed-card.css';

export type CardProgress = 'fresh' | 'started' | 'finished';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly progress: CardProgress;
  /** How the sheet has fared so far, once known. */
  readonly stats: SheetStats | null;
  readonly onPlay: (event: MouseEvent) => void;
};

const CTA: Record<CardProgress, string> = {
  fresh: COPY.cardPlay,
  started: COPY.cardResume,
  finished: COPY.cardDone,
};

/**
 * The post as it appears in the feed: today's sheet as an object worth
 * stopping for, the game's idea as a one-tap question, and one button.
 */
/** The line under the button: how a trap is catching people, how many have played, or the motto. */
const metaLine = (sheet: SheetDescriptor, stats: SheetStats | null): string => {
  if (!stats || stats.hands === 0) return COPY.tagline;
  if (sheet.kind === 'trap' && stats.hands >= COMMUNITY.quietHands) return COPY.trap.caught(stats.caught, stats.hands);
  return COPY.cardHands(stats.hands);
};

export const FeedCard = ({ sheet, progress, stats, onPlay }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useMemo(
    () => ({
      ops: opsForPrefix(sheet.spec.moves, sheet.spec.moves.length),
      ground: sheet.spec.ground,
      palette: shadingPaletteOf(getPalette(sheet.spec.paletteId)),
      ghost: 0,
    }),
    [sheet],
  );
  useCpuSheet(canvasRef, frame);

  return (
    <main className="card">
      <div className="card__preview">
        <button type="button" className="card__tray" onClick={onPlay} aria-label={`${COPY.cardHeroHint}: Sheet No. ${sheet.number}`}>
          <canvas ref={canvasRef} className="card__sheet" aria-hidden />
          <span className="card__hero-hint" aria-hidden>
            {COPY.cardHeroHint}
          </span>
        </button>
      </div>
      <div className="card__side">
        <SheetPlaque sheet={sheet} />
        <SampleQuestion paletteId={sheet.spec.paletteId} />
        <button type="button" className="card__play" onClick={onPlay}>
          {sheet.kind === 'trap' && progress === 'fresh' ? COPY.trap.cardPlay : CTA[progress]}
        </button>
        <p className="card__meta">{metaLine(sheet, stats)}</p>
      </div>
    </main>
  );
};
