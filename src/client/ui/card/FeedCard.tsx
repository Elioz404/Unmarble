import { useMemo, useRef, type MouseEvent } from 'react';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { COPY } from '../copy.ts';
import { Plaque } from '../game/Chrome.tsx';
import { SampleQuestion } from './SampleQuestion.tsx';
import { useCpuSheet } from './use-cpu-sheet.ts';
import './feed-card.css';

export type CardProgress = 'fresh' | 'started' | 'finished';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly progress: CardProgress;
  readonly hands: number | null;
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
export const FeedCard = ({ sheet, progress, hands, onPlay }: Props) => {
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
        <div className="card__tray">
          <canvas ref={canvasRef} className="card__sheet" role="img" aria-label={`Sheet No. ${sheet.number}`} />
        </div>
      </div>
      <div className="card__side">
        <Plaque
          number={sheet.number}
          weekday={sheet.weekday}
          stars={sheet.spec.stars}
          paletteName={sheet.name ?? sheet.paletteName}
        />
        <SampleQuestion paletteId={sheet.spec.paletteId} />
        <button type="button" className="card__play" onClick={onPlay}>
          {CTA[progress]}
        </button>
        <p className="card__meta">
          {hands !== null && hands > 0 ? `${hands} ${hands === 1 ? 'hand has' : 'hands have'} worked this sheet` : COPY.tagline}
        </p>
      </div>
    </main>
  );
};
