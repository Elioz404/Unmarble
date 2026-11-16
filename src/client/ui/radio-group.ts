import type { KeyboardEvent } from 'react';

/** The arrow keys, and which way each moves through a radio group. */
const ARROW_STEPS: Readonly<Partial<Record<string, 1 | -1>>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Buttons that make a radio group, as screen readers announce it: the group
 * is one Tab stop (its checked option), and the arrow keys move the choice
 * and the focus together, wrapping at the ends. Returns the props of each
 * option's button, clicks included; the buttons must be the group element's own children.
 */
export const radioOption =
  <T>(options: readonly T[], checked: T, pick: (option: T) => void) =>
  (option: T) => ({
    role: 'radio' as const,
    'aria-checked': option === checked,
    tabIndex: option === checked ? 0 : -1,
    onClick: (): void => pick(option),
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      const step = ARROW_STEPS[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const next = (options.indexOf(option) + step + options.length) % options.length;
      const target = options[next];
      if (target === undefined) return;
      pick(target);
      event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    },
  });
