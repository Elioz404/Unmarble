import { RULES } from '../../../shared/config.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import { COPY } from '../copy.ts';
import { LensIcon, SoundOffIcon, SoundOnIcon } from '../icons.tsx';
import { Seal, TearStrip, ToolStars } from '../ornaments.tsx';
import './chrome.css';

/** Difficulty runs from one star to five. */
const MAX_STARS = 5;

/** "Nº", set as a compositor would: an N and a raised, underlined o. Read aloud as "Number". */
export const Numero = () => (
  <>
    <span aria-hidden>
      N<span className="numero__o">o</span>
    </span>
    <span className="visually-hidden">{COPY.number}</span>
  </>
);

/** The sheet's plaque: wordmark, number, day, difficulty and palette. */
export const Plaque = ({
  number,
  weekday,
  stars,
  paletteName,
  eyebrow,
}: {
  readonly number: number | null;
  readonly weekday: string;
  readonly stars: number;
  readonly paletteName: string;
  readonly eyebrow?: string;
}) => (
  <div className="plaque">
    <p className="plaque__wordmark label">{eyebrow ?? COPY.wordmark}</p>
    <h1 className="plaque__title">
      {number !== null ? (
        <>
          <span className="plaque__no">
            <Numero />
          </span>{' '}
          <span className="plaque__number figures">{number}</span>{' '}
        </>
      ) : null}
      <span className="plaque__day">{weekday}</span>
    </h1>
    <p className="plaque__meta">
      <span className="plaque__stars" role="img" aria-label={`${stars} of ${MAX_STARS} stars`}>
        <ToolStars count={stars} of={MAX_STARS} />
      </span>
      <span className="plaque__dot" aria-hidden>
        ·
      </span>
      <span className="plaque__palette">{paletteName}</span>
    </p>
  </div>
);

/**
 * The sheet's plaque: a daily sheet by number and day, a trap by its maker.
 * `eyebrow` replaces the wordmark over a daily sheet that nobody set.
 */
export const SheetPlaque = ({ sheet, eyebrow }: { readonly sheet: SheetDescriptor; readonly eyebrow?: string }) =>
  sheet.kind === 'trap' ? (
    <Plaque
      number={null}
      weekday={sheet.name ?? COPY.trap.title}
      stars={sheet.spec.stars}
      paletteName={sheet.paletteName}
      eyebrow={COPY.trap.by(sheet.author ?? 'someone')}
    />
  ) : (
    <Plaque
      number={sheet.number}
      weekday={sheet.weekday}
      stars={sheet.spec.stars}
      paletteName={sheet.name ? COPY.communityName(sheet.name) : sheet.paletteName}
      {...(sheet.author ? { eyebrow: COPY.trap.sheetOfWeek(sheet.author) } : eyebrow ? { eyebrow } : {})}
    />
  );

export const SoundToggle = ({ muted, onToggle }: { readonly muted: boolean; readonly onToggle: () => void }) => (
  <button
    type="button"
    className="icon-button"
    onClick={onToggle}
    aria-pressed={!muted}
    aria-label={muted ? `${COPY.sound}: off` : `${COPY.sound}: on`}
  >
    {muted ? <SoundOffIcon /> : <SoundOnIcon />}
  </button>
);

/** One gilt seal per move: filled as each move is undone. */
export const SealRow = ({ total, remaining }: { readonly total: number; readonly remaining: number }) => {
  const done = total - remaining;
  return (
    <ol className="seals" aria-label={COPY.sealsLabel(done, total)}>
      {Array.from({ length: total }, (_, i) => (
        <li key={i} className="seals__seal" data-done={i < done}>
          <Seal state={i < done ? 'gilt' : 'empty'} />
        </li>
      ))}
    </ol>
  );
};

/** How much more the paper can take. */
export const TearMeter = ({ blots }: { readonly blots: number }) => {
  const left = Math.max(0, RULES.maxBlots - blots);
  return (
    <div className="tears" aria-label={COPY.blotsLabel(left)}>
      {Array.from({ length: RULES.maxBlots }, (_, i) => (
        <TearStrip key={i} torn={i < blots} />
      ))}
    </div>
  );
};

export const LensButton = ({
  left,
  disabled,
  onUse,
}: {
  readonly left: number;
  readonly disabled: boolean;
  readonly onUse: () => void;
}) => (
  <button type="button" className="lens-button" onClick={onUse} disabled={disabled || left === 0}>
    <LensIcon size={20} />
    <span>{left > 0 ? COPY.lens : COPY.lensUsed}</span>
  </button>
);

/** A single line under the plaque: feedback, hint or lesson prompt. Never a paragraph. */
export const MessageLine = ({ text, tone }: { readonly text: string; readonly tone: 'quiet' | 'alert' | 'gilt' }) => (
  // The live region stays mounted so screen readers hear every change; only the text is re-keyed to animate.
  <p className="message" data-tone={tone} aria-live="polite">
    <span className="message__text" key={text}>
      {text}
    </span>
  </p>
);
