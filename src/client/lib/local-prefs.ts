/**
 * Per-viewer conveniences (mute, hints already seen). Browser storage can be
 * missing or wiped on every app upload, so every access is guarded and the
 * app works the same without it. Nothing that matters lives here.
 */
const PREFIX = 'unmarble:';

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage unavailable: the preference simply lasts for this session.
  }
};

/** Finished sheets remembered; enough to tell a newcomer from a regular. */
const FINISHED_KEPT = 10;

const finishedSheets = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(read('finished') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export const localPrefs = {
  muted: (): boolean => read('muted') === '1',
  setMuted: (muted: boolean): void => write('muted', muted ? '1' : '0'),
  hasSeen: (hint: string): boolean => read(`hint:${hint}`) === '1',
  markSeen: (hint: string): void => write(`hint:${hint}`, '1'),
  /** How many different sheets this device has finished (capped; only "new or not" matters). */
  finishedCount: (): number => finishedSheets().length,
  markFinished: (sheetId: string): void => {
    const finished = finishedSheets();
    if (!finished.includes(sheetId)) write('finished', JSON.stringify([...finished, sheetId].slice(-FINISHED_KEPT)));
  },
  lessonSeen: (lessonId: string): boolean => read(`lesson:${lessonId}`) === '1',
  markLessonSeen: (lessonId: string): void => write(`lesson:${lessonId}`, '1'),
};
