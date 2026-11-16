import { useMemo, useState } from 'react';
import type { SheetDescriptor, TrapRejection } from '../../../shared/protocol/api.ts';
import { DROP_SIZES, INK_SLOTS } from '../../../shared/puzzle/moves.ts';
import type { TrapCheck } from '../../../shared/puzzle/trap.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import type { SoundBank } from '../../audio/sound.ts';
import { ComposerController, type ComposerTool } from '../../game/composer.ts';
import type { Platform } from '../../platform/platform.ts';
import { COPY } from '../copy.ts';
import { BackIcon, DropToolIcon, FoldToolIcon, SwirlToolIcon, UndoIcon } from '../icons.tsx';
import { prefersReducedMotion, useStore } from '../hooks/use-store.ts';
import { MessageLine, Plaque } from '../game/Chrome.tsx';
import { SheetStage } from '../game/SheetStage.tsx';
import './composer-screen.css';

/** Overlay colours are paper colours, independent of the app theme. */
const OVERLAY = { ink: '#1F1A14', accent: '#8E3328', blot: '#8E3328' } as const;

const TOOLS: readonly { tool: ComposerTool; label: string; Icon: typeof DropToolIcon }[] = [
  { tool: 'drop', label: COPY.trap.tools.drop, Icon: DropToolIcon },
  { tool: 'fold', label: COPY.trap.tools.fold, Icon: FoldToolIcon },
  { tool: 'swirl', label: COPY.trap.tools.swirl, Icon: SwirlToolIcon },
];

/** One plain line describing the trap's state, numbered for people (move 1 = the first). */
const checkLine = (check: TrapCheck, moves: number, tool: ComposerTool): { text: string; tone: 'quiet' | 'alert' | 'gilt' } => {
  const problem = check.problem;
  if (!problem) return { text: COPY.trap.ready(check.stars, moves), tone: 'gilt' };
  if (moves === 0) return { text: COPY.trap.toolHints[tool], tone: 'quiet' };
  switch (problem.kind) {
    case 'too-few':
    case 'too-many':
    case 'starts-bare':
      return { text: COPY.trap.problems[problem.kind], tone: problem.kind === 'too-few' ? 'quiet' : 'alert' };
    default:
      return { text: COPY.trap.problems[problem.kind](problem.move + 1), tone: 'alert' };
  }
};

type Published = { readonly sheet: SheetDescriptor; readonly postUrl: string | null };

type Props = {
  readonly platform: Platform;
  /** Today's sheet: its paper (palette and ground) is the trap's paper. */
  readonly paper: SheetDescriptor;
  readonly sound: SoundBank;
  readonly onBack: () => void;
};

/** Set a trap: marble a sheet for others, checked live against the same contract as daily sheets. */
export const ComposerScreen = ({ platform, paper, sound, onBack }: Props) => {
  const palette = getPalette(paper.spec.paletteId);
  const composer = useMemo(
    () =>
      new ComposerController({
        paper: paper.spec,
        sound,
        reducedMotion: prefersReducedMotion,
        colors: () => ({ ...OVERLAY, paper: palette.paper }),
      }),
    [paper.spec, sound, palette.paper],
  );
  const view = useStore(composer.view);
  const [publishing, setPublishing] = useState(false);
  // A refusal applies to the trap as it was submitted; any change clears it.
  const [refusal, setRefusal] = useState<{ reason: TrapRejection; moves: readonly unknown[] } | null>(null);
  const rejection = refusal && refusal.moves === view.moves ? refusal.reason : null;
  const [published, setPublished] = useState<Published | null>(null);

  const publish = async (): Promise<void> => {
    setPublishing(true);
    try {
      const response = await platform.publishTrap(view.moves);
      if (response.kind === 'published') setPublished({ sheet: response.sheet, postUrl: response.postUrl });
      else setRefusal({ reason: response.reason, moves: view.moves });
    } catch {
      setRefusal({ reason: 'invalid', moves: view.moves });
    } finally {
      setPublishing(false);
    }
  };

  const line = rejection ? { text: COPY.trap.rejected[rejection], tone: 'alert' as const } : checkLine(view.check, view.moves.length, view.tool);
  const postUrl = published?.postUrl ?? null;

  return (
    <main className="game compose">
      <header className="game__header">
        <button type="button" className="icon-button compose__back" onClick={onBack} aria-label={COPY.book.back}>
          <BackIcon />
        </button>
        <Plaque
          number={null}
          weekday={COPY.trap.composeTitle}
          stars={view.check.stars}
          paletteName={paper.paletteName}
          eyebrow={COPY.trap.composeEyebrow}
        />
      </header>

      <MessageLine text={published ? COPY.trap.published : line.text} tone={published ? 'gilt' : line.tone} />

      <SheetStage
        controller={composer}
        label={`Your trap, ${view.moves.length} moves`}
        mood={published ? 'lifted' : 'floating'}
        jolt={null}
        cursor={view.tool === 'fold' ? 'crosshair' : 'cell'}
      />

      {published ? (
        <section className="compose__done">
          <p>{COPY.trap.publishedNote}</p>
          <div className="actions">
            {postUrl ? (
              <button type="button" className="button button--primary" onClick={() => platform.openPost(postUrl)}>
                {COPY.trap.seePost}
              </button>
            ) : null}
            <button type="button" className="button" onClick={onBack}>
              {COPY.trap.backToSheet}
            </button>
          </div>
        </section>
      ) : (
        <footer className="compose__tools">
          <div className="compose__row" role="radiogroup" aria-label="Tool">
            {TOOLS.map(({ tool, label, Icon }) => (
              <button
                key={tool}
                type="button"
                role="radio"
                aria-checked={view.tool === tool}
                className="compose__tool"
                onClick={() => composer.setTool(tool)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              className="compose__tool"
              onClick={() => void composer.undo()}
              disabled={view.moves.length === 0 || view.busy}
            >
              <UndoIcon size={20} />
              <span>{COPY.trap.undo}</span>
            </button>
          </div>

          <div className="compose__row compose__options">
            {view.tool === 'drop' ? (
              <>
                <span className="compose__sizes" role="radiogroup" aria-label="Drop size">
                  {DROP_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={view.size === size}
                      className="compose__size"
                      data-size={size}
                      onClick={() => composer.setSize(size)}
                      aria-label={`Size ${size}`}
                    />
                  ))}
                </span>
                <span className="compose__inks" role="radiogroup" aria-label="Ink">
                  {INK_SLOTS.map((ink) => (
                    <button
                      key={ink}
                      type="button"
                      role="radio"
                      aria-checked={view.ink === ink}
                      className="compose__ink"
                      style={{ background: palette.inks[ink] }}
                      onClick={() => composer.setInk(ink)}
                      aria-label={`Ink ${ink + 1}`}
                    />
                  ))}
                </span>
              </>
            ) : view.tool === 'swirl' ? (
              <span className="compose__turns" role="radiogroup" aria-label="Turn">
                {([1, -1] as const).map((turn) => (
                  <button
                    key={turn}
                    type="button"
                    role="radio"
                    aria-checked={view.turn === turn}
                    className="compose__turn"
                    data-turn={turn}
                    onClick={() => composer.setTurn(turn)}
                    aria-label={COPY.trap.turn[turn]}
                  >
                    <SwirlToolIcon size={20} />
                  </button>
                ))}
              </span>
            ) : (
              <span className="compose__hint">{COPY.trap.toolHints.fold}</span>
            )}
          </div>

          <button
            type="button"
            className="button button--primary compose__publish"
            disabled={view.check.problem !== null || view.busy || publishing}
            onClick={() => void publish()}
          >
            {publishing ? COPY.trap.publishing : COPY.trap.publish}
          </button>
        </footer>
      )}
    </main>
  );
};
