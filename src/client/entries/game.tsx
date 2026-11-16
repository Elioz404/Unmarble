import '../ui/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRedditPlatform } from '../platform/reddit-platform.ts';
import { probeSmallCaps } from '../ui/fonts.ts';
import { GameApp } from '../ui/GameApp.tsx';
import { FoilDefs } from '../ui/ornaments.tsx';
import { mountRoot } from './mount.ts';

/** Expanded entry: the full game. */
probeSmallCaps();
createRoot(mountRoot()).render(
  <StrictMode>
    <FoilDefs />
    <GameApp platform={createRedditPlatform()} />
  </StrictMode>,
);
