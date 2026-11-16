import type { ActionRequest, ActionResponse, LoggedAction, Standing } from '../../shared/protocol/api.ts';
import { AttemptConflictError, type AttemptSink } from '../game/attempt-sink.ts';

/** A transport failure worth retrying (network down, server error, timeout). */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

export type QueueOptions = {
  readonly sheetId: string;
  /** Log length already held by the server when the attempt was loaded. */
  readonly startSeq: number;
  /** Sends one sequenced action; throws TransientError for retryable failures. */
  readonly send: (request: ActionRequest) => Promise<ActionResponse>;
  readonly retries: number;
  readonly backoffMs: number;
  readonly sleep: (ms: number) => Promise<void>;
};

/**
 * An attempt sink that delivers actions strictly in order, one at a time,
 * each tagged with its position in the log. Transient failures are retried
 * with exponential backoff (the server treats a resend as idempotent); a
 * conflict stops the queue for good, because the device's view of the
 * attempt is no longer the truth.
 */
export const createAttemptQueue = (options: QueueOptions): AttemptSink => {
  let seq = options.startSeq;
  let tail: Promise<unknown> = Promise.resolve();
  let broken = false;

  const deliver = async (request: ActionRequest): Promise<Standing | null> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await options.send(request);
        if (response.kind === 'conflict') {
          broken = true;
          throw new AttemptConflictError();
        }
        return response.standing;
      } catch (error) {
        if (!(error instanceof TransientError) || attempt >= options.retries) throw error;
        await options.sleep(options.backoffMs * 2 ** attempt);
      }
    }
  };

  return {
    record(entry: LoggedAction): Promise<Standing | null> {
      if (broken) return Promise.reject(new AttemptConflictError());
      const request: ActionRequest = { sheetId: options.sheetId, seq: seq++, entry };
      const result = tail.then(() => (broken ? Promise.reject(new AttemptConflictError()) : deliver(request)));
      tail = result.catch(() => undefined);
      return result;
    },
  };
};
