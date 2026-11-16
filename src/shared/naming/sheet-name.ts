/**
 * The naming ritual: people reply to the sheet's pinned comment with what the
 * finished sheet looks like, and the best-voted reply names it in the Book.
 * Names are short, human and written in native, reportable comments; nothing
 * is generated and no free text is ever typed inside the app.
 */
export const NAMING = Object.freeze({
  maxWords: 3,
  maxLength: 24,
  /** Minimum net votes, relative to how many people played. */
  minScore: 2,
  scorePerHands: 0.08,
});

const WORD = /^[\p{L}][\p{L}'’-]*$/u;

/** Words a name may not contain. Reddit's own filters and moderators do the rest. */
const BLOCKED = new Set(['fuck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'nazi', 'porn', 'sex']);

/** Normalises a reply into a candidate name, or null if it is not one. */
export const parseSheetName = (body: string): string | null => {
  const words = body.trim().replace(/[.!?]+$/u, '').split(/\s+/u).filter(Boolean);
  if (words.length === 0 || words.length > NAMING.maxWords) return null;
  if (!words.every((w) => WORD.test(w))) return null;
  if (words.some((w) => BLOCKED.has(w.toLowerCase().replace(/['’-]/gu, '')))) return null;
  const name = words.map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()).join(' ');
  return name.length <= NAMING.maxLength ? name : null;
};

/** Votes a candidate needs before it can name a sheet played by `hands` people. */
export const nameThreshold = (hands: number): number =>
  Math.max(NAMING.minScore, Math.ceil(hands * NAMING.scorePerHands));
