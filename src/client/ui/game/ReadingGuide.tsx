import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SheetPoint } from '../../../shared/game/session.ts';
import type { SheetThread } from '../../../shared/protocol/api.ts';
import { LESSONS, type Lesson } from '../../../shared/puzzle/tutorial.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import { OverlayPainter } from '../../game/overlay.ts';
import { SpecimenPlayer, type SpecimenAnswer } from '../../game/specimen.ts';
import { COPY } from '../copy.ts';
import { useSheetGestures } from '../hooks/use-sheet-gestures.ts';
import { prefersReducedMotion } from '../hooks/use-store.ts';
import { CloseIcon } from '../icons.tsx';
import { overlayTokens } from './overlay-tokens.ts';
import './reading-guide.css';

/** Where the guide's map leads: the screens it can open, and the sheet's own thread. */
export type GuideActions = {
  readonly openBook: () => void;
  readonly openTraps: () => void;
  readonly compose: () => void;
  readonly pickPractice: () => void;
};

type Props = {
  readonly actions: GuideActions;
  /** The sheet's Reddit thread, when its pinned comment can still name it. */
  readonly namingThread: SheetThread | null;
  readonly onOpenThread: (url: string) => void;
  /** The guide closed (its close button, Escape, or a way out to another screen). */
  readonly onClose: () => void;
};

/** What a specimen's line says after a touch; null keeps the lesson's own prompt. */
type Reply = Exclude<SpecimenAnswer, 'none'> | 'solved' | null;

const REPLY_COPY: Record<Exclude<Reply, null>, string> = {
  right: COPY.guide.right,
  solved: COPY.guide.solved,
  wrong: COPY.guide.wrong,
  'wrong-way': COPY.guide.wrongWay,
};

/**
 * Each lesson's title: its reading. One lesson per reading (see
 * `tutorial.test.ts`), so no two specimens share a heading or a spoken name.
 */
const SPECIMENS: readonly { readonly lesson: Lesson; readonly title: string }[] = LESSONS.map((lesson) => ({
  lesson,
  title: COPY.guide.readings[lesson.teaches],
}));

/**
 * One lesson as a live specimen: the same sheet, the same ghost finger,
 * read by the same rules, but nothing tears and nothing is kept. Undo it
 * to bare water, then lay it out again.
 */
const LessonSpecimen = ({ lesson, title }: { readonly lesson: Lesson; readonly title: string }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<SpecimenPlayer | null>(null);
  const [reply, setReply] = useState<Reply>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!sheet || !canvas || !overlay) return;
    const paper = getPalette(lesson.spec.paletteId).paper;
    const player = new SpecimenPlayer(canvas, lesson.spec, {
      reducedMotion: prefersReducedMotion,
      undoable: lesson.spec.moves.length,
      ghost: { painter: new OverlayPainter(overlay), colors: () => ({ ...overlayTokens(), paper }) },
    });
    playerRef.current = player;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const ratio = SpecimenPlayer.pixelRatio;
      const width = Math.round(entry.contentRect.width * ratio);
      const height = Math.round(entry.contentRect.height * ratio);
      if (width > 0 && height > 0) player.resize(width, height);
    });
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      player.dispose();
      playerRef.current = null;
    };
  }, [lesson]);

  const handlers = useMemo(() => {
    const answer = (result: SpecimenAnswer | undefined): void => {
      if (!result || result === 'none') return;
      setReply(result === 'right' && playerRef.current?.solved ? 'solved' : result);
    };
    return {
      onTap: (point: SheetPoint) => answer(playerRef.current?.tap(point)),
      onDrag: (path: readonly SheetPoint[]) => answer(playerRef.current?.drag(path)),
      onTrace: (points: readonly SheetPoint[]) => playerRef.current?.trace(points),
    };
  }, []);
  useSheetGestures(sheetRef, handlers);

  const again = (): void => {
    playerRef.current?.reset();
    setReply(null);
  };

  return (
    <li className="guide__lesson">
      <span className="guide__mount">
        <div ref={sheetRef} className="guide__sheet" role="img" aria-label={COPY.guide.specimen(title)}>
          <canvas ref={canvasRef} className="guide__canvas" />
          <canvas ref={overlayRef} className="guide__canvas" />
        </div>
      </span>
      <div className="guide__lesson-text">
        <h4 className="guide__reading label">{title}</h4>
        <p className="guide__prompt">{lesson.prompt}</p>
        <p className="guide__reply" data-reply={reply ?? undefined} aria-live="polite">
          {reply ? REPLY_COPY[reply] : null}
        </p>
        {reply ? (
          <button type="button" className="button guide__again" onClick={again}>
            {COPY.guide.again}
          </button>
        ) : null}
      </div>
    </li>
  );
};

type Destination = {
  readonly key: string;
  readonly copy: { readonly title: string; readonly note: string; readonly action: string };
  /** Null when there is nowhere to go from here (no thread to name this sheet in). */
  readonly go: (() => void) | null;
};

/**
 * The pocket reading guide: the order rule in one line, every lesson as a
 * live specimen, and a map of what else the app offers, each a tap away.
 * A modal dialog over the whole screen, so the sheet is out of sight while
 * it is open; one scroll, nothing to page through.
 */
export const ReadingGuide = ({ actions, namingThread, onOpenThread, onClose }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    // Taken out of the page whole when it closes, so it only ever needs opening.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  /** Closes the guide, then leaves for `go`. */
  const leave = (go: () => void): void => {
    dialogRef.current?.close();
    go();
  };

  const here = COPY.guide.here;
  const destinations: readonly Destination[] = [
    { key: 'trap', copy: here.trap, go: actions.compose },
    { key: 'sunday', copy: here.sunday, go: actions.openTraps },
    { key: 'name', copy: here.name, go: namingThread ? () => onOpenThread(namingThread.url) : null },
    { key: 'book', copy: here.book, go: actions.openBook },
    { key: 'practice', copy: here.practice, go: actions.pickPractice },
  ];

  return (
    <dialog ref={dialogRef} className="guide" aria-labelledby={titleId} onClose={onClose}>
      <div className="guide__page">
        <header className="guide__header">
          <div className="plaque">
            <p className="plaque__wordmark label">{COPY.wordmark}</p>
            <h2 id={titleId} className="plaque__title">
              <span className="plaque__day">{COPY.guide.title}</span>
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => dialogRef.current?.close()} aria-label={COPY.close}>
            <CloseIcon />
          </button>
        </header>

        <p className="guide__rule">{COPY.guide.rule}</p>

        <section className="guide__section" aria-labelledby={`${titleId}-readings`}>
          <h3 id={`${titleId}-readings`} className="guide__head label">
            {COPY.guide.readingsHead}
          </h3>
          <ol className="guide__lessons">
            {SPECIMENS.map(({ lesson, title }) => (
              <LessonSpecimen key={lesson.id} lesson={lesson} title={title} />
            ))}
          </ol>
          <p className="guide__exact">{COPY.guide.exact}</p>
        </section>

        <section className="guide__section" aria-labelledby={`${titleId}-here`}>
          <h3 id={`${titleId}-here`} className="guide__head label">
            {COPY.guide.hereHead}
          </h3>
          <ul className="guide__map">
            {destinations.map(({ key, copy, go }) => (
              <li key={key} className="guide__place">
                <div className="guide__place-text">
                  <h4 className="guide__place-title">{copy.title}</h4>
                  <p className="guide__place-note">{copy.note}</p>
                </div>
                {go ? (
                  <button type="button" className="button guide__go" onClick={() => leave(go)}>
                    {copy.action}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </dialog>
  );
};
