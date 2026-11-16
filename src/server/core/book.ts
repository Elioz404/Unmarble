import type { BookEntry, BookResponse, SheetDescriptor } from '../../shared/protocol/api.ts';
import { dailySheetId } from '../../shared/puzzle/daily.ts';
import { addDays } from '../../shared/time/calendar.ts';
import type { AttemptService } from './attempts.ts';
import type { SheetService } from './sheets.ts';
import type { TrapService } from './traps.ts';

/** How far back the Book reaches, and how many traps it lists. */
export const BOOK = Object.freeze({ days: 30, traps: 30 });

/**
 * The Book: every past daily sheet and the latest traps, with how this player
 * stands with each. Past sheets stay playable (ranked with their day's hands)
 * but never count towards a streak.
 */
export class BookService {
  readonly #sheets: SheetService;
  readonly #traps: TrapService;
  readonly #attempts: AttemptService;

  constructor(sheets: SheetService, traps: TrapService, attempts: AttemptService) {
    this.#sheets = sheets;
    this.#traps = traps;
    this.#attempts = attempts;
  }

  async forPlayer(playerId: string | null): Promise<BookResponse> {
    const today = this.#sheets.today();
    const firstDay = await this.#sheets.firstDay();
    const dailyIds = Array.from({ length: BOOK.days }, (_, back) => addDays(today, -back))
      .filter((day) => day >= firstDay)
      .map(dailySheetId);
    const dailies = (await Promise.all(dailyIds.map((id) => this.#sheets.byId(id)))).filter((s) => s !== null);
    const [traps, leader] = await Promise.all([this.#traps.recent(BOOK.traps), this.#traps.leaderFor(today)]);
    return {
      dailies: await Promise.all(dailies.map((sheet) => this.#entry(sheet, playerId, false))),
      traps: await Promise.all(traps.map((sheet) => this.#entry(sheet, playerId, sheet.id === leader?.id))),
    };
  }

  async #entry(sheet: SheetDescriptor, playerId: string | null, inTheRunning: boolean): Promise<BookEntry> {
    const [status, stats] = await Promise.all([this.#attempts.statusOf(sheet.id, playerId), this.#attempts.stats(sheet.id)]);
    return { sheet, status, stats, inTheRunning };
  }
}
