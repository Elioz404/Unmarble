import { createHmac, randomBytes } from 'node:crypto';
import { buildDailySheet, dailySheetId, dateKeyOfSheetId, featuredDailySheet } from '../../shared/puzzle/daily.ts';
import type { SheetDescriptor } from '../../shared/protocol/api.ts';
import { parseSheetDescriptor } from '../../shared/protocol/post-data.ts';
import { dateKeyOf, weekdayOf, type DateKey } from '../../shared/time/calendar.ts';
import { readJson } from './json.ts';
import { keys } from './keys.ts';
import type { Store } from './store.ts';

/** Picks a community sheet to feature on a given Sunday, if one deserves it. */
export type FeaturedProvider = (sunday: DateKey) => Promise<SheetDescriptor | null>;

const SUNDAY = 0;

/**
 * Daily sheets for one installation. Only today's sheet is ever generated
 * (from the date and a secret created at install time, so tomorrow cannot be
 * computed from the public source); it is cached on its day, and past sheets
 * are served from that cache only. No public request can make the server
 * generate or store a sheet for an arbitrary date. On Sundays the sheet may
 * instead be the week's best community trap.
 */
export class SheetService {
  readonly #store: Store;
  readonly #now: () => number;
  #featured: FeaturedProvider = async () => null;

  constructor(store: Store, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  /** Lets Sunday sheets come from the community (wired by the composition root). */
  featureFrom(provider: FeaturedProvider): void {
    this.#featured = provider;
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

  /** Today's sheet, generated and cached on first request. */
  async todaySheet(): Promise<SheetDescriptor> {
    const dateKey = this.today();
    const cached = await this.#cached(dailySheetId(dateKey));
    if (cached) return cached;
    const featured = weekdayOf(dateKey) === SUNDAY ? await this.#featured(dateKey) : null;
    const sheet = featured ? featuredDailySheet(dateKey, featured) : await this.#generate(dateKey);
    await this.#store.set(keys.sheet(sheet.id), JSON.stringify(sheet), { nx: true });
    return (await this.#cached(sheet.id)) ?? sheet;
  }

  /** Today's sheet, or a past sheet that was published on its day; never a future one. */
  async byId(sheetId: string): Promise<SheetDescriptor | null> {
    const dateKey = dateKeyOfSheetId(sheetId);
    if (!dateKey) return null;
    const today = this.today();
    if (dateKey === today) return this.todaySheet();
    if (dateKey > today) return null;
    return this.#cached(sheetId);
  }

  async setName(sheetId: string, name: string | null): Promise<void> {
    const sheet = await this.#cached(sheetId);
    if (!sheet) return;
    await this.#store.set(keys.sheet(sheetId), JSON.stringify({ ...sheet, name }));
  }

  async #generate(dateKey: DateKey): Promise<SheetDescriptor> {
    const secret = await this.ensureSecret();
    const seed = createHmac('sha256', secret).update(dateKey).digest('hex');
    return buildDailySheet(dateKey, seed);
  }

  async #cached(sheetId: string): Promise<SheetDescriptor | null> {
    return parseSheetDescriptor(readJson(await this.#store.get(keys.sheet(sheetId))));
  }
}
