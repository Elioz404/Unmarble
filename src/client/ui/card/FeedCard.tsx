import { useMemo, useRef, type CSSProperties, type MouseEvent } from 'react';
import { apprenticeRun } from '../../../shared/game/apprentice.ts';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import type { SheetDescriptor, SheetStats } from '../../../shared/protocol/api.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { COPY } from '../copy.ts';
import { SheetPlaque } from '../game/Chrome.tsx';
import { metaLine } from './meta-line.ts';
import { SampleQuestion } from './SampleQuestion.tsx';
import { useCpuSheet } from './use-cpu-sheet.ts';
import { useGlintOnce } from './use-glint.ts';
import './feed-card.css';

export type CardProgress = 'fresh' | 'started' | 'finished';

type Props = {
  readonly sheet: SheetDescriptor;
  readonly progress: CardProgress;
  /** How the sheet has fared so far, once known. */
  readonly stats: SheetStats | null;
  /** The pinned hub post, which always shows today's sheet. */
  readonly atelier: boolean;
  readonly onPlay: (event: MouseEvent) => void;
};

const CTA: Record<CardProgress, string> = {
  fresh: COPY.cardPlay,
  started: COPY.cardResume,
  finished: COPY.cardDone,
};

/**
 * The post as it appears in the feed: today's sheet as a finished specimen
 * tipped into a sample book, the game's idea as a one-tap question, and one
 * button.
 */
export const FeedCard = ({ sheet, progress, stats, atelier, onPlay }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leafRef = useRef<HTMLSpanElement>(null);
  const frame = useMemo(
    () => ({
      ops: opsForPrefix(sheet.spec.moves, sheet.spec.moves.length),
      ground: sheet.spec.ground,
      palette: shadingPaletteOf(getPalette(sheet.spec.paletteId)),
    }),
    [sheet],
  );
  useCpuSheet(canvasRef, frame);
  const apprentice = useMemo(() => apprenticeRun(sheet.spec), [sheet]);
  const glint = useGlintOnce(leafRef);
  // The backing leaf is the colourway's darker stock, so its deckle reads against the paper.
  const leaf = { '--leaf': getPalette(sheet.spec.paletteId).band } as CSSProperties;

  return (
    <main className="card">
      <div className="card__preview">
        <button type="button" className="card__open" onClick={onPlay} aria-label={`${COPY.cardHeroHint}: Sheet No. ${sheet.number}`}>
          <span className="card__tray">
            <span ref={leafRef} className="card__leaf" style={leaf}>
              <canvas ref={canvasRef} className="card__sheet" aria-hidden />
              {glint.state === 'on' ? <span className="card__glint" aria-hidden onAnimationEnd={glint.finish} /> : null}
            </span>
          </span>
          <span className="card__slip" aria-hidden>
            {COPY.cardHeroHint}
          </span>
        </button>
      </div>
      <div className="card__side">
        <SheetPlaque sheet={sheet} {...(atelier ? { eyebrow: COPY.atelierEyebrow } : {})} />
        <SampleQuestion paletteId={sheet.spec.paletteId} />
        <button type="button" className="spine" onClick={onPlay}>
          {sheet.kind === 'trap' && progress === 'fresh' ? COPY.trap.cardPlay : CTA[progress]}
        </button>
        <p className="card__meta">{metaLine(sheet, stats, apprentice)}</p>
      </div>
    </main>
  );
};
