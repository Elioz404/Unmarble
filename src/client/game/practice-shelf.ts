import { PRACTICE } from '../../shared/config.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import { GenerationError } from '../../shared/puzzle/generator.ts';
import { practiceRecipe, searchPractice, type PracticeRequest, type PracticeSearch } from '../../shared/puzzle/practice.ts';
import type { Stars } from '../../shared/puzzle/sheet.ts';
import { dateKeyOf } from '../../shared/time/calendar.ts';

/**
 * Marbles practice sheets on the main thread without freezing it: the search
 * runs in short slices, each on its own macrotask, so the page keeps drawing
 * and taking input. A sheet can be marbled ahead of time in idle slices (the
 * "shelf"), so the next one is ready the moment the player asks for it.
 * Nothing here touches the network.
 */

/** What the player chose: a difficulty, and one of its recipes or any. */
export type PracticeChoice = { readonly stars: Stars; readonly recipeId: string | null };

/** A marbled practice sheet and the request that made it (its seed included). */
export type PracticeSheet = { readonly sheet: SheetDescriptor; readonly request: PracticeRequest };

/** A fresh random seed, as hex. */
export const newPracticeSeed = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(PRACTICE.seedBytes)), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );

type Task = () => void;

/** The next macrotask, ahead of timers: a slice runs as soon as the page has painted and handled input. */
const nextTask = (() => {
  let channel: MessageChannel | null = null;
  const queue: Task[] = [];
  return (task: Task): void => {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => queue.shift()?.();
    }
    queue.push(task);
    channel.port2.postMessage(null);
  };
})();

/** A slice of search, given how long it may run (ms). */
type Slice = (budgetMs: number) => void;

/**
 * When the page is idle: for sheets marbled ahead, which must never compete
 * with play. The slice gets what is left of the idle period, never more than
 * a hurried slice, so it ends before the next frame is due.
 */
const whenIdle = (slice: Slice): void => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback((deadline) => slice(Math.min(PRACTICE.sliceMs, deadline.timeRemaining())));
  } else {
    window.setTimeout(() => slice(PRACTICE.idleFallbackSliceMs), PRACTICE.idleFallbackMs);
  }
};

/** One practice sheet being marbled, slice by slice. */
export class PracticeJob {
  readonly choice: PracticeChoice;
  /** The recipe "any" avoids: the one just played. */
  readonly avoid: string | null;
  /** The seed it was asked for, or null when it drew its own. */
  readonly seed: string | null;
  readonly sheet: Promise<PracticeSheet>;
  #urgent = false;
  #cancelled = false;
  #done = false;
  #failed = false;
  /** The next slice of the search, set once the search has begun. */
  #slice: Slice = () => undefined;
  /** Bumped on every scheduling: only the latest scheduled slice runs, so a job hurried out of idle time runs once. */
  #ticket = 0;

  constructor(choice: PracticeChoice, avoid: string | null, seed: string | null) {
    this.choice = choice;
    this.avoid = avoid;
    this.seed = seed;
    this.sheet = new Promise((resolve, reject) => {
      const today = dateKeyOf(Date.now());
      let retries: number = PRACTICE.retries;
      let request: PracticeRequest;
      let search: PracticeSearch;
      const begin = (nextSeed: string): void => {
        request = { ...choice, seed: nextSeed };
        search = searchPractice(request, practiceRecipe(request, avoid), today);
      };
      const slice = (budgetMs: number): void => {
        if (this.#cancelled) return;
        // An idle period already used up by the page: wait for the next one rather than overrun the frame.
        if (budgetMs <= 0) {
          this.#schedule();
          return;
        }
        let found: SheetDescriptor | null = null;
        try {
          found = search.step(budgetMs);
        } catch (error) {
          if (!(error instanceof GenerationError) || retries === 0) {
            this.#done = true;
            this.#failed = true;
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          retries--;
          begin(newPracticeSeed());
        }
        if (found) {
          this.#done = true;
          resolve({ sheet: found, request });
        } else {
          this.#schedule();
        }
      };
      begin(seed ?? newPracticeSeed());
      this.#slice = slice;
      this.#schedule();
    });
    // A sheet marbled ahead may never be asked for; its failure is reported only to whoever waits for it.
    this.sheet.catch(() => undefined);
  }

  /** Whether it has a sheet, or has given up. */
  get done(): boolean {
    return this.#done;
  }

  /**
   * From idle time to the next macrotask: the player is waiting for this one.
   * The slice waiting for idle time moves at once, since idle time may be long in coming.
   */
  hurry(): void {
    if (this.#urgent) return;
    this.#urgent = true;
    if (!this.#done) this.#schedule();
  }

  /** Back to idle time: nobody is waiting for it any more. */
  relax(): void {
    this.#urgent = false;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  /** Whether it can serve `choice` (a seed only when asked for that one); never once it has given up. */
  matches(choice: PracticeChoice, avoid: string | null, seed: string | null): boolean {
    if (this.#failed) return false;
    const sameChoice = this.choice.stars === choice.stars && this.choice.recipeId === choice.recipeId;
    return sameChoice && this.avoid === avoid && (seed === null || this.seed === seed);
  }

  #schedule(): void {
    const ticket = ++this.#ticket;
    const run = (budgetMs: number): void => {
      if (ticket === this.#ticket) this.#slice(budgetMs);
    };
    if (this.#urgent) nextTask(() => run(PRACTICE.sliceMs));
    else whenIdle(run);
  }
}

/** At most one sheet marbled ahead, for the settings the player is most likely to ask for next. */
let shelved: PracticeJob | null = null;

export const practiceShelf = {
  /** Starts marbling a sheet for `choice` in idle time, unless one is already on the shelf. */
  prefetch(choice: PracticeChoice, avoid: string | null): void {
    if (shelved?.matches(choice, avoid, null)) return;
    shelved?.cancel();
    shelved = new PracticeJob(choice, avoid, null);
  },

  /** The sheet for `choice`, hurried: the one on the shelf when it matches, else a new one. */
  take(choice: PracticeChoice, avoid: string | null, seed: string | null): PracticeJob {
    const job = shelved?.matches(choice, avoid, seed) ? shelved : new PracticeJob(choice, avoid, seed);
    if (job !== shelved) shelved?.cancel();
    shelved = null;
    job.hurry();
    return job;
  },

  /** A job nobody waits for any more goes back on the shelf, unless it has finished (its sheet was shown). */
  release(job: PracticeJob): void {
    if (job.done) return;
    if (shelved && shelved !== job) shelved.cancel();
    job.relax();
    shelved = job;
  },
};
