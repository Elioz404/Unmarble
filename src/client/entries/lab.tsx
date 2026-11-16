import '../ui/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isStars } from '../../shared/puzzle/sheet.ts';
import { createLabPlatform } from '../platform/lab-platform.ts';
import { CardApp } from '../ui/card/CardApp.tsx';
import { probeSmallCaps } from '../ui/fonts.ts';
import { GameApp, type PracticeLink } from '../ui/GameApp.tsx';
import { FeedBoard } from '../ui/lab/FeedBoard.tsx';
import { LabControls } from '../ui/lab/LabControls.tsx';
import { ParityBoard } from '../ui/lab/ParityBoard.tsx';
import { FoilDefs } from '../ui/ornaments.tsx';
import { mountRoot } from './mount.ts';

/**
 * The lab: the app in a plain browser, no Reddit involved. Used for design
 * reviews and for playtests with strangers.
 *
 *   lab.html                 the full game (default)
 *   lab.html?view=card       the in-feed card alone
 *   lab.html?view=card&post=atelier   the card as the pinned hub post
 *   lab.html?view=board      the card at several feed widths
 *   lab.html?view=parity     the WebGL and CPU renderers side by side, and how far apart they are
 *   lab.html?practice=3      a ★★★ practice sheet, any recipe
 *   lab.html?practice=4&recipe=storm-4&seed=ab12   one recipe, and one sheet of it
 *
 * The game and the card carry lab controls to restart or start over.
 */
const search = new URLSearchParams(window.location.search);
const view = search.get('view') ?? 'game';

const navigate = (nextView: string): void => {
  const next = new URLSearchParams(search);
  next.set('view', nextView);
  window.location.assign(`?${next.toString()}`);
};

/** `?practice=<stars>[&recipe=<id>][&seed=<hex>]`: open straight on a practice sheet. */
const practiceLink = (): PracticeLink | null => {
  const stars = Number(search.get('practice'));
  if (!isStars(stars)) return null;
  return { choice: { stars, recipeId: search.get('recipe') }, seed: search.get('seed') };
};

const platform = createLabPlatform(search, {
  onOpenGame: () => navigate('game'),
  onCloseGame: () => navigate('card'),
});

const app =
  view === 'board' ? (
    <FeedBoard search={search} />
  ) : view === 'parity' ? (
    <ParityBoard />
  ) : view === 'card' ? (
    <CardApp platform={platform} initial={null} atelier={search.get('post') === 'atelier'} />
  ) : (
    <GameApp platform={platform} practice={practiceLink()} />
  );

probeSmallCaps();
createRoot(mountRoot()).render(
  <StrictMode>
    <FoilDefs />
    {app}
    {view === 'game' || view === 'card' ? <LabControls /> : null}
  </StrictMode>,
);
