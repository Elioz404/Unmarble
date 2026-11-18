import type { ReactNode } from 'react';
import { RULES } from '../../../shared/config.ts';
import { assertNever } from '../../lib/assert-never.ts';
import type { SheetDescriptor } from '../../../shared/protocol/api.ts';
import type { RecipeTag } from '../../../shared/puzzle/recipes.ts';
import { COPY } from '../copy.ts';
import { LensIcon, SoundOffIcon, SoundOnIcon } from '../icons.tsx';
import { Seal, SpecialMark, TearStrip, ToolStars } from '../ornaments.tsx';
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

/** A recipe's title; a special day's carries its gilt mark. */
export const RecipeTitle = ({ recipe }: { readonly recipe: RecipeTag }) => (
  <>
    {recipe.special ? (
      <>
        <SpecialMark label={COPY.specialDay} />{' '}
      </>
    ) : null}
    {recipe.title}
  </>
);

/** What a daily sheet goes by: the community's name for it, else its recipe, else its colourway. */
export const SheetDetail = ({ sheet }: { readonly sheet: SheetDescriptor }) =>
  sheet.name ? COPY.communityName(sheet.name) : sheet.recipe ? <RecipeTitle recipe={sheet.recipe} /> : sheet.paletteName;

/** The sheet's plaque: wordmark, number, day, difficulty and a detail (the recipe or the colourway). */
export const Plaque = ({
  number,
  weekday,
  stars,
  detail,
  eyebrow,
}: {
  readonly number: number | null;
  /** The plaque's title: the day, or what stands in for one. */
  readonly weekday: ReactNode;
  readonly stars: number;
  readonly detail: ReactNode;
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
      <span className="plaque__palette">{detail}</span>
    </p>
  </div>
);

/**
 * The sheet's plaque: a daily sheet by number and day, a trap by its maker, a
 * practice sheet by its recipe, under "Practice" and with no number.
 * `eyebrow` replaces the wordmark over a daily sheet that nobody set.
 */
export const SheetPlaque = ({ sheet, eyebrow }: { readonly sheet: SheetDescriptor; readonly eyebrow?: string }) => {
  switch (sheet.kind) {
    case 'trap':
      return (
        <Plaque
          number={null}
          weekday={sheet.name ?? COPY.trap.title}
          stars={sheet.spec.stars}
          detail={sheet.paletteName}
          eyebrow={COPY.trap.by(sheet.author ?? 'someone')}
        />
      );
    case 'daily':
      return (
        <Plaque
          number={sheet.number}
          weekday={sheet.weekday}
          stars={sheet.spec.stars}
          detail={<SheetDetail sheet={sheet} />}
          {...(sheet.author ? { eyebrow: COPY.trap.sheetOfWeek(sheet.author) } : eyebrow ? { eyebrow } : {})}
        />
      );
    case 'practice':
      return (
        <Plaque
          number={null}
          weekday={sheet.recipe ? <RecipeTitle recipe={sheet.recipe} /> : COPY.practice.title}
          stars={sheet.spec.stars}
          detail={sheet.paletteName}
          eyebrow={COPY.practice.eyebrow}
        />
      );
    default:
      return assertNever(sheet.kind);
  }
};

/**
 * How far through the lessons a newcomer is: one dot per lesson, the ones
 * done filled and the one on screen ringed, so the way to the real sheet
 * shows its end. Read aloud as "Lesson 1 of 2".
 */
export const LessonDots = ({ index, total }: { readonly index: number; readonly total: number }) => (
  <span className="lesson-dots" role="img" aria-label={COPY.lessonOf(index + 1, total)}>
    <span aria-hidden>{COPY.lessons}</span>
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className="lesson-dots__dot"
        aria-hidden
        data-state={i < index ? 'done' : i === index ? 'current' : 'next'}
      />
    ))}
  </span>
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
