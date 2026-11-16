import { createHmac, randomBytes } from 'node:crypto';
import { buildDailySheet, dailySheetId, dateKeyOfSheetId } from '../../shared/puzzle/daily.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import { parseSheetDescriptor } from '../../shared/protocol/post-data.ts';
import { dateKeyOf, type DateKey } from '../../shared/time/calendar.ts';
import { readJson } from './json.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/**
 * Daily sheets for one installation. Each is generated once from the date and
 * a secret created at install time (so tomorrow cannot be computed from the
 * public source), then cached so every request sees the identical sheet.
 */
export class SheetService {
  readonly #store: Store;
  readonly #now: () => number;

  constructor(store: Store, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  today(): DateKey {
    return dateKeyOf(this.#now());
  }

  /** Creates the installation secret if it does not exist yet. */
  async ensureSecret(): Promise<string> {
    const existing = await this.#store.get(keys.secret());
    if (existing) return existing;
    await this.#store.set(keys.secret(), randomBytes(32).toString('hex'), { nx: true });
    const secret = await this.#store.get(keys.secret());
    if (!secret) throw new Error('Could not create the installation secret');
    return secret;
  }

  async byDate(dateKey: DateKey): Promise<SheetDescriptor> {
    const id = dailySheetId(dateKey);
    const cached = parseSheetDescriptor(readJson(await this.#store.get(keys.sheet(id))));
    if (cached) return cached;
    const secret = await this.ensureSecret();
    const seed = createHmac('sha256', secret).update(dateKey).digest('hex');
    const sheet = buildDailySheet(dateKey, seed);
    await this.#store.set(keys.sheet(sheet.id), JSON.stringify(sheet));
    return sheet;
  }

  /** A sheet by id; only past and present sheets exist. */
  async byId(sheetId: string): Promise<SheetDescriptor | null> {
    const dateKey = dateKeyOfSheetId(sheetId);
    if (!dateKey || dateKey > this.today()) return null;
    return this.byDate(dateKey);
  }

  async setName(sheetId: string, name: string | null): Promise<void> {
    const sheet = await this.byId(sheetId);
    if (!sheet) return;
    await this.#store.set(keys.sheet(sheetId), JSON.stringify({ ...sheet, name }));
  }
}
