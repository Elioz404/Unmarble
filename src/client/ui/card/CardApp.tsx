import { useEffect, useState, type MouseEvent } from 'react';
import { replaySession } from '../../../shared/game/session.ts';
import type { SheetDescriptor, SheetResponse } from '../../../shared/protocol/api.ts';
import type { Platform } from '../../platform/platform.ts';
import { StatusScreen } from '../StatusScreen.tsx';
import { FeedCard, type CardProgress } from './FeedCard.tsx';

const progressOf = (response: SheetResponse): CardProgress => {
  if (response.player.log.length === 0) return 'fresh';
  return replaySession(response.sheet.spec, response.player.log).status === 'playing' ? 'started' : 'finished';
};

/**
 * Hosts the feed card. The first paint comes from post data (no network);
 * the player's progress arrives afterwards and only refines the button.
 */
export const CardApp = ({ platform, initial }: { readonly platform: Platform; readonly initial: SheetDescriptor | null }) => {
  const [sheet, setSheet] = useState<SheetDescriptor | null>(initial);
  const [response, setResponse] = useState<SheetResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    platform
      .loadSheet()
      .then((loaded) => {
        if (cancelled) return;
        setResponse(loaded);
        setSheet(loaded.sheet);
      })
      .catch((error: unknown) => {
        console.error('Card could not load progress', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (!sheet) return <StatusScreen kind={failed ? 'failed' : 'loading'} />;
  return (
    <FeedCard
      sheet={sheet}
      progress={response ? progressOf(response) : 'fresh'}
      stats={response?.stats ?? null}
      onPlay={(event: MouseEvent) => platform.openGame(event.nativeEvent)}
    />
  );
};
