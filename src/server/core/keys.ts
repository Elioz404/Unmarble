/**
 * Every Redis key the app uses, in one place. Redis is scoped per subreddit
 * installation, so keys never need a subreddit prefix.
 */
export const keys = Object.freeze({
  /** Random secret generated on install; seeds the daily sheets. */
  secret: () => 'config:secret',
  /** Cached descriptor of a sheet (JSON). */
  sheet: (sheetId: string) => `sheet:${sheetId}`,
  /** Post bound to a daily sheet, and the pinned naming comment. */
  sheetPost: (sheetId: string) => `sheet:${sheetId}:post`,
  /** Hash: player → JSON action log. */
  attempts: (sheetId: string) => `attempts:${sheetId}`,
  /** Sorted set: player → rank score (lower is better). */
  board: (sheetId: string) => `board:${sheetId}`,
  /** Hash: hands, cleans. */
  stats: (sheetId: string) => `stats:${sheetId}`,
  /** Hash: "x,y" cell → blot count. */
  scars: (sheetId: string) => `scars:${sheetId}`,
  /** Hash: move index → players who tore on it. */
  traps: (sheetId: string) => `traps:${sheetId}`,
  /** Hash: comment id → candidate name. */
  names: (sheetId: string) => `names:${sheetId}`,
  /** Hash: naming comment id → sheet id (reverse lookup for triggers). */
  namingComments: () => 'naming-comments',
  /** Hash: post id → sheet id (reverse lookup for menu actions). */
  postSheets: () => 'post-sheets',
  /** Hash: per-player progress (streak, last day played). */
  player: (playerId: string) => `player:${playerId}`,
  /** The Atelier hub post id. */
  atelierPost: () => 'atelier:post',
});

/** Attempt data older than this is forgotten. */
export const RETENTION_SECONDS = 60 * 24 * 60 * 60;
