/**
 * Every Redis key the app uses, in one place. Redis is scoped per subreddit
 * installation, so keys never need a subreddit prefix.
 */
export const keys = Object.freeze({
  /** Random secret generated on install; seeds the daily sheets. */
  secret: () => 'config:secret',
  /** UTC date of this community's Sheet No. 1: the day the app was installed. */
  firstDay: () => 'config:first-day',
  /** Cached descriptor of a sheet (JSON). */
  sheet: (sheetId: string) => `sheet:${sheetId}`,
  /** Hash: publishing progress of a sheet's daily post (post id, comment id, steps done). */
  sheetPost: (sheetId: string) => `sheet:${sheetId}:post`,
  /** Short-lived lock held while a sheet's daily post is being published. */
  publishLock: (sheetId: string) => `sheet:${sheetId}:publishing`,
  /** Hash: player → JSON action log. */
  attempts: (sheetId: string) => `attempts:${sheetId}`,
  /** Hash: player → server time (ms) of their first recorded action. */
  attemptStarts: (sheetId: string) => `attempt-starts:${sheetId}`,
  /** Hash: player → final Result (JSON), written once when the attempt ends. */
  results: (sheetId: string) => `results:${sheetId}`,
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
  /** Hash: per-player progress (streak, last day played); expires once they stop playing. */
  player: (playerId: string) => `player:${playerId}`,
  /**
   * Hash: a player's opt-in streak flair (enabled, username, the flair it
   * replaced). Never expires: the app must always be able to give a flair back.
   */
  flair: (playerId: string) => `player:${playerId}:flair`,
  /** The Atelier hub post id. */
  atelierPost: () => 'atelier:post',
  /** A trap's descriptor (JSON). */
  trap: (trapId: string) => `trap:${trapId}`,
  /** Hash: a trap's maker (player id), publish time (ms), post and pinned notes. */
  trapMeta: (trapId: string) => `trap:${trapId}:meta`,
  /** Short-lived lock held while a trap's pinned notes are first written. */
  trapNotesLock: (trapId: string) => `trap:${trapId}:noting`,
  /** Hash: trap id → post id. */
  trapPosts: () => 'trap-posts',
  /** Sorted set: trap id → creation time (ms); newest last. */
  recentTraps: () => 'traps:recent',
  /** Hash: player → trap id, for the one trap a player may set per day. */
  trapsSetOn: (dateKey: string) => `traps:set-on:${dateKey}`,
});

/** Attempt data older than this is forgotten. */
export const RETENTION_SECONDS = 60 * 24 * 60 * 60;
