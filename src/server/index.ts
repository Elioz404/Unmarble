import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api.ts';
import { internal } from './routes/internal.ts';

const app = new Hono();

app.route('/api', api);
app.route('/internal', internal);

app.onError((error, c) => {
  console.error(`${c.req.method} ${c.req.path} failed`, error);
  return c.json({ error: 'Something went wrong' }, 500);
});

serve({ fetch: app.fetch, createServer, port: getServerPort() });
