import '../ui/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createLabPlatform } from '../platform/lab-platform.ts';
import { GameApp } from '../ui/GameApp.tsx';
import { mountRoot } from './mount.ts';

/**
 * The lab: the full game in a plain browser, no Reddit involved. Used for
 * design reviews and for playtests with strangers (see lab-platform.ts).
 */
const search = new URLSearchParams(window.location.search);
const platform = createLabPlatform(search, {
  onOpenGame: () => undefined,
  onCloseGame: () => undefined,
});

createRoot(mountRoot()).render(
  <StrictMode>
    <GameApp platform={platform} />
  </StrictMode>,
);
