import '../ui/styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { context } from '@devvit/web/client';
import { parsePostBinding } from '../../shared/protocol/post-data.ts';
import { createRedditPlatform } from '../platform/reddit-platform.ts';
import { CardApp } from '../ui/card/CardApp.tsx';
import { mountRoot } from './mount.ts';

/** Inline entry: the post as it appears in the feed. */
const binding = parsePostBinding(context.postData);

createRoot(mountRoot()).render(
  <StrictMode>
    <CardApp platform={createRedditPlatform()} initial={binding?.sheet ?? null} />
  </StrictMode>,
);
