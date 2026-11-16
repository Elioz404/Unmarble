import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cardSample } from '../../../shared/puzzle/tutorial.ts';
import { SpecimenPlayer } from '../../game/specimen.ts';
import { COPY } from '../copy.ts';
import { prefersReducedMotion } from '../hooks/use-store.ts';

type Answer = 'asking' | 'right' | 'wrong';

/**
 * The card's one-tap specimen: two drops, one question. Tapping the round
 * one draws it back into the water right there in the feed. Taps only, so it
 * never fights the feed's scrolling.
 */
export const SampleQuestion = ({ paletteId }: { readonly paletteId: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<SpecimenPlayer | null>(null);
  const [answer, setAnswer] = useState<Answer>('asking');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const player = new SpecimenPlayer(canvas, cardSample(paletteId), prefersReducedMotion);
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, [paletteId]);

  const onClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const result = playerRef.current?.tap((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    if (result === 'right' || result === 'wrong') setAnswer(result);
  };

  return (
    <div className="sample" data-answer={answer}>
      <canvas
        ref={canvasRef}
        className="sample__sheet"
        onClick={onClick}
        aria-label="Two drops: tap the one that fell last"
      />
      <div className="sample__text">
        <p className="sample__question">{COPY.cardQuestion}</p>
        <p className="sample__reply" aria-live="polite">
          {answer === 'right' ? COPY.cardSampleRight : answer === 'wrong' ? COPY.cardSampleWrong : COPY.cardSamplePrompt}
        </p>
      </div>
    </div>
  );
};
