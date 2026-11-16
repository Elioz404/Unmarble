import { useEffect, useState } from 'react';
import { recipesForStars } from '../../../shared/puzzle/recipes.ts';
import { STARS, type Stars } from '../../../shared/puzzle/sheet.ts';
import { WEEKDAY_NAMES } from '../../../shared/time/calendar.ts';
import type { PracticeChoice } from '../../game/practice-shelf.ts';
import { localPrefs } from '../../lib/local-prefs.ts';
import { COPY } from '../copy.ts';
import { RecipeTitle } from '../game/Chrome.tsx';
import { BackIcon } from '../icons.tsx';
import { ToolStars } from '../ornaments.tsx';
import { radioOption } from '../radio-group.ts';
import '../book/book-screen.css';
import './practice-picker.css';

/** The weekdays whose own recipes a difficulty draws on, in catalogue order (Monday first, Sunday last). */
const weekdaysOf = (stars: Stars): string[] => [
  ...new Set(recipesForStars(stars).flatMap((r) => (r.special ? [] : [WEEKDAY_NAMES[r.weekday] ?? '']))),
];

type Props = {
  /** The choice to open on; its difficulty defaults to the one last chosen. */
  readonly initial: PracticeChoice | null;
  readonly onBack: () => void;
  readonly onMarble: (choice: PracticeChoice) => void;
  /** Marbles the current choice ahead in idle time, so pressing the button is instant. */
  readonly onPrefetch: (choice: PracticeChoice) => void;
};

/** Practice sheets: pick a difficulty, maybe one of its recipes, and marble as many as you like. */
export const PracticePicker = ({ initial, onBack, onMarble, onPrefetch }: Props) => {
  const [stars, setStars] = useState<Stars>(() => initial?.stars ?? localPrefs.practiceStars());
  const [recipeId, setRecipeId] = useState<string | null>(initial?.recipeId ?? null);
  const recipes = recipesForStars(stars);
  const chosen = recipes.find((r) => r.id === recipeId) ?? null;

  useEffect(() => onPrefetch({ stars, recipeId: chosen?.id ?? null }), [onPrefetch, stars, chosen]);

  const pickStars = (next: Stars): void => {
    setStars(next);
    setRecipeId(null);
    localPrefs.setPracticeStars(next);
  };
  const levelRadio = radioOption(STARS, stars, pickStars);
  const recipeRadio = radioOption([null, ...recipes.map((r) => r.id)], chosen?.id ?? null, setRecipeId);

  return (
    <main className="book practice">
      <header className="book__header">
        <button type="button" className="icon-button" onClick={onBack} aria-label={COPY.book.back}>
          <BackIcon />
        </button>
        <div className="plaque">
          <p className="plaque__wordmark label">{COPY.practice.pickerEyebrow}</p>
          <h1 className="plaque__title">
            <span className="plaque__day">{COPY.practice.title}</span>
          </h1>
        </div>
      </header>

      <p className="book__rule">{COPY.practice.lead}</p>

      <section className="practice__section" aria-labelledby="practice-difficulty">
        <h2 id="practice-difficulty" className="book__week-head label">
          {COPY.practice.difficulty}
        </h2>
        <div className="practice__levels" role="radiogroup" aria-labelledby="practice-difficulty">
          {STARS.map((level) => (
            <button key={level} type="button" className="practice__level" {...levelRadio(level)}>
              <span className="practice__level-stars">
                <ToolStars count={level} label={COPY.stars(level)} />
              </span>
              <span className="practice__level-days">{COPY.practice.days(weekdaysOf(level))}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="practice__section" aria-labelledby="practice-recipe">
        <h2 id="practice-recipe" className="book__week-head label">
          {COPY.practice.recipe}
        </h2>
        <div className="practice__recipes" role="radiogroup" aria-labelledby="practice-recipe">
          <button type="button" className="practice__recipe" {...recipeRadio(null)}>
            {COPY.practice.anyRecipe}
          </button>
          {recipes.map((r) => (
            <button key={r.id} type="button" className="practice__recipe" {...recipeRadio(r.id)}>
              <RecipeTitle recipe={r} />
            </button>
          ))}
        </div>
        <p className="practice__promise" aria-live="polite">
          {chosen ? chosen.promise : COPY.practice.anyPromise}
        </p>
      </section>

      <button
        type="button"
        className="button button--primary book__compose"
        onClick={() => onMarble({ stars, recipeId: chosen?.id ?? null })}
      >
        {COPY.practice.marble}
      </button>
    </main>
  );
};
