import { reddit } from '@devvit/web/server';
import type { PostBinding } from '../../shared/protocol/post-data.ts';

/** Post data as Reddit's API accepts it (JSON, at most 2 KB). */
type PostData = NonNullable<Parameters<typeof reddit.submitCustomPost>[0]['postData']>;

/** Serialises a binding into plain JSON post data (the 2 KB public payload). */
const toPostData = (binding: PostBinding): PostData => JSON.parse(JSON.stringify(binding));

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
};
