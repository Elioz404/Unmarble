import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SheetResponse } from '../../shared/protocol/api.ts';
import { SoundBank } from '../audio/sound.ts';
import { localPrefs } from '../lib/local-prefs.ts';
import type { Platform } from '../platform/platform.ts';
import { GameScreen } from './game/GameScreen.tsx';
import { StatusScreen } from './StatusScreen.tsx';

type Load = { kind: 'loading' } | { kind: 'ready'; response: SheetResponse } | { kind: 'failed' };

/** Loads the sheet from the platform and hosts the game with its sound. */
export const GameApp = ({ platform }: { readonly platform: Platform }) => {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [muted, setMuted] = useState(localPrefs.muted);
  const sound = useMemo(() => new SoundBank(localPrefs.muted(), localPrefs.setMuted), []);

  const [generation, setGeneration] = useState(0);

  useEffect(() => sound.attach(), [sound]);

  useEffect(() => {
    let cancelled = false;
    platform
      .loadSheet()
      .then((response) => !cancelled && setLoad({ kind: 'ready', response }))
      .catch((error: unknown) => {
        console.error('Failed to load the sheet', error);
        if (!cancelled) setLoad({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [platform, generation]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  const toggleMute = (): void => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    setMuted(sound.muted);
  };

  if (load.kind === 'loading') return <StatusScreen kind="loading" />;
  if (load.kind === 'failed') return <StatusScreen kind="failed" />;
  return (
    <GameScreen
      key={generation}
      platform={platform}
      response={load.response}
      sound={sound}
      muted={muted}
      onToggleMute={toggleMute}
      onReload={reload}
    />
  );
};
