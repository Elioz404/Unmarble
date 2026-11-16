import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SheetResponse } from '../../shared/protocol/api.ts';
import { SoundBank } from '../audio/sound.ts';
import { localPrefs } from '../lib/local-prefs.ts';
import type { Platform } from '../platform/platform.ts';
import { BookScreen } from './book/BookScreen.tsx';
import { ComposerScreen } from './compose/ComposerScreen.tsx';
import { GameScreen, type GameNavigation } from './game/GameScreen.tsx';
import { StatusScreen } from './StatusScreen.tsx';

/** Where the player is inside the expanded game. */
type Route =
  /** A sheet: the post's own (null) or one picked from the Book. */
  | { readonly screen: 'sheet'; readonly sheetId: string | null }
  | { readonly screen: 'book' }
  /** Setting a trap on today's paper. */
  | { readonly screen: 'compose' };

type Load = { kind: 'loading' } | { kind: 'ready'; response: SheetResponse } | { kind: 'failed' };

/**
 * Loads one sheet (by id, or the post's own) and reloads when `generation`
 * changes. Results are tagged with the request they answer, so a stale answer
 * simply reads as "still loading" for the new request.
 */
const useSheet = (
  platform: Platform,
  sheetId: string | null | undefined,
  generation: number,
  onLoaded: (response: SheetResponse) => void,
): Load => {
  const request = sheetId === undefined ? null : `${sheetId ?? 'post'}:${generation}`;
  const [answer, setAnswer] = useState<{ request: string; load: Load } | null>(null);
  useEffect(() => {
    if (request === null) return;
    let cancelled = false;
    platform
      .loadSheet(sheetId ?? undefined)
      .then((response) => {
        if (cancelled) return;
        onLoaded(response);
        setAnswer({ request, load: { kind: 'ready', response } });
      })
      .catch((error: unknown) => {
        console.error('Failed to load the sheet', error);
        if (!cancelled) setAnswer({ request, load: { kind: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [platform, sheetId, request, onLoaded]);
  return answer && answer.request === request ? answer.load : { kind: 'loading' };
};

/** Hosts the expanded game: the sheet, the Book and the trap editor, with shared sound. */
export const GameApp = ({ platform }: { readonly platform: Platform }) => {
  const [route, setRoute] = useState<Route>({ screen: 'sheet', sheetId: null });
  const [generation, setGeneration] = useState(0);
  const [todayId, setTodayId] = useState<string | null>(null);
  const [muted, setMuted] = useState(localPrefs.muted);
  const sound = useMemo(() => new SoundBank(localPrefs.muted(), localPrefs.setMuted), []);
  useEffect(() => sound.attach(), [sound]);

  // The sheet being played, or (in the editor) today's sheet, whose paper a trap uses.
  const wanted = route.screen === 'sheet' ? route.sheetId : route.screen === 'compose' ? todayId : undefined;
  const rememberToday = useCallback((response: SheetResponse) => setTodayId(response.todayId), []);
  const load = useSheet(platform, wanted, generation, rememberToday);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  const navigation = useMemo<GameNavigation>(
    () => ({
      openBook: () => setRoute({ screen: 'book' }),
      compose: () => setRoute({ screen: 'compose' }),
      play: (sheetId: string) => setRoute({ screen: 'sheet', sheetId }),
    }),
    [],
  );
  const home = useCallback(() => setRoute({ screen: 'sheet', sheetId: null }), []);

  const toggleMute = (): void => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    setMuted(sound.muted);
  };

  if (route.screen === 'book') {
    return <BookScreen platform={platform} onBack={home} onPlay={navigation.play} onCompose={navigation.compose} />;
  }
  if (load.kind === 'loading') return <StatusScreen kind="loading" />;
  if (load.kind === 'failed') return <StatusScreen kind="failed" />;
  if (route.screen === 'compose') {
    return <ComposerScreen platform={platform} paper={load.response.sheet} sound={sound} onBack={home} />;
  }
  return (
    <GameScreen
      key={`${load.response.sheet.id}:${generation}`}
      platform={platform}
      response={load.response}
      sound={sound}
      muted={muted}
      onToggleMute={toggleMute}
      onReload={reload}
      navigation={navigation}
    />
  );
};
