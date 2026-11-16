import { context, reddit } from '@devvit/web/server';
import type { PostBinding } from '../../shared/protocol/post-data.ts';

/** Post data as Reddit's API accepts it (JSON, at most 2 KB). */
type PostData = NonNullable<Parameters<typeof reddit.submitCustomPost>[0]['postData']>;

/** Serialises a binding into plain JSON post data (the 2 KB public payload). */
const toPostData = (binding: PostBinding): PostData => JSON.parse(JSON.stringify(binding));

/** A user's flair in the subreddit, as far as the app reads or restores it. */
export type FlairLabel = { readonly text: string; readonly cssClass: string };

/**
 * The Reddit operations the app performs, behind one narrow port so the
 * services stay testable and the Devvit surface is visible in one file.
 */
export type RedditPort = {
  submitSheetPost(options: { title: string; binding: PostBinding; fallback: string }): Promise<string>;
  suggestTopComments(postId: string): Promise<void>;
  stickyPost(postId: string, slot: 1 | 2): Promise<void>;
  replaceBinding(postId: string, binding: PostBinding): Promise<void>;
  submitComment(postId: string, text: string): Promise<string>;
  /** Distinguishes a comment as the app and pins it to the top of the thread. */
  pinComment(commentId: string): Promise<void>;
  editComment(commentId: string, text: string): Promise<void>;
  /** Current score of a comment, or null if it was removed or marked spam. Throws when the lookup fails. */
  liveCommentScore(commentId: string): Promise<number | null>;
  subscribeCurrentUser(): Promise<void>;
  /** A user's flair in the current subreddit, or null when they have none. */
  userFlair(username: string): Promise<FlairLabel | null>;
  /** Sets a user's flair in the current subreddit (replacing what they had). */
  setUserFlair(username: string, flair: FlairLabel): Promise<void>;
  removeUserFlair(username: string): Promise<void>;
  /** Whether the user is banned from the current subreddit. */
  isBanned(username: string): Promise<boolean>;
};

type T1 = `t1_${string}`;
type T3 = `t3_${string}`;

const isPostId = (id: string): id is T3 => id.startsWith('t3_');
const isCommentId = (id: string): id is T1 => id.startsWith('t1_');

const asPostId = (id: string): T3 => {
  if (!isPostId(id)) throw new TypeError(`Not a post id: ${id}`);
  return id;
};

const asCommentId = (id: string): T1 => {
  if (!isCommentId(id)) throw new TypeError(`Not a comment id: ${id}`);
  return id;
};

export const devvitReddit: RedditPort = {
  async submitSheetPost({ title, binding, fallback }) {
    const post = await reddit.submitCustomPost({
      title,
      entry: 'default',
      postData: toPostData(binding),
      textFallback: { text: fallback },
    });
    return post.id;
  },
  async suggestTopComments(postId) {
    const post = await reddit.getPostById(asPostId(postId));
    await post.setSuggestedCommentSort('TOP');
  },
  async stickyPost(postId, slot) {
    const post = await reddit.getPostById(asPostId(postId));
    await post.sticky(slot);
  },
  async replaceBinding(postId, binding) {
    const post = await reddit.getPostById(asPostId(postId));
    await post.setPostData(toPostData(binding));
  },
  async submitComment(postId, text) {
    const comment = await reddit.submitComment({ id: asPostId(postId), text });
    return comment.id;
  },
  async pinComment(commentId) {
    const comment = await reddit.getCommentById(asCommentId(commentId));
    await comment.distinguish(true);
  },
  async editComment(commentId, text) {
    const comment = await reddit.getCommentById(asCommentId(commentId));
    await comment.edit({ text });
  },
  async liveCommentScore(commentId) {
    const comment = await reddit.getCommentById(asCommentId(commentId));
    return comment.removed || comment.spam ? null : comment.score;
  },
  async subscribeCurrentUser() {
    await reddit.subscribeToCurrentSubreddit();
  },
  async userFlair(username) {
    const user = await reddit.getUserByUsername(username);
    const flair = await user?.getUserFlairBySubreddit(context.subredditName);
    const text = flair?.flairText ?? '';
    const cssClass = flair?.flairCssClass ?? '';
    return text || cssClass ? { text, cssClass } : null;
  },
  async setUserFlair(username, { text, cssClass }) {
    await reddit.setUserFlair({ subredditName: context.subredditName, username, text, ...(cssClass ? { cssClass } : {}) });
  },
  async removeUserFlair(username) {
    await reddit.removeUserFlair(context.subredditName, username);
  },
  async isBanned(username) {
    const banned = await reddit.getBannedUsers({ subredditName: context.subredditName, username, limit: 1 }).all();
    return banned.some((user) => user.username.toLowerCase() === username.toLowerCase());
  },
};
