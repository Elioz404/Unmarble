/**
 * Player identities. Signed-in players are known by their Reddit user id;
 * logged-out visitors by their device id (loid), under a prefix that keeps
 * the two apart wherever only real accounts may count.
 */
const ANONYMOUS_PREFIX = 'anon:';

export const anonymousPlayerId = (loid: string): string => `${ANONYMOUS_PREFIX}${loid}`;

export const isSignedIn = (playerId: string): boolean => !playerId.startsWith(ANONYMOUS_PREFIX);
