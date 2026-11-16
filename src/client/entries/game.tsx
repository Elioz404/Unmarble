import '../ui/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRedditPlatform } from '../platform/reddit-platform.ts';
import { GameApp } from '../ui/GameApp.tsx';
import { mountRoot } from './mount.ts';

/** Expanded entry: the full game. */
createRoot(mountRoot()).render(
  <StrictMode>
    <GameApp platform={createRedditPlatform()} />
  </StrictMode>,
);
