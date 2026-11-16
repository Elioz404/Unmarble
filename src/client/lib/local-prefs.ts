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

export const localPrefs = {
  muted: (): boolean => read('muted') === '1',
  setMuted: (muted: boolean): void => write('muted', muted ? '1' : '0'),
  hasSeen: (hint: string): boolean => read(`hint:${hint}`) === '1',
  markSeen: (hint: string): void => write(`hint:${hint}`, '1'),
  tutorialDone: (): boolean => read('tutorial') === '1',
  setTutorialDone: (): void => write('tutorial', '1'),
};
