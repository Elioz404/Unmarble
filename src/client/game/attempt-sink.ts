import type { LoggedAction, Standing } from '../../shared/protocol/api.ts';

/** Records an action wherever attempts are kept (server, local storage, nowhere). */
export type AttemptSink = {
  /** Resolves with the standing once the attempt is over; rejects with AttemptConflictError on divergence. */
  record(entry: LoggedAction): Promise<Standing | null>;
};

/** The stored attempt no longer matches this device's: the sheet must be reloaded. */
export class AttemptConflictError extends Error {
  constructor() {
    super('The attempt was changed elsewhere');
    this.name = 'AttemptConflictError';
  }
}

/** An attempt that is not recorded anywhere (lessons). */
export const NOWHERE: AttemptSink = { record: async () => null };
