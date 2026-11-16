import { useEffect, useRef, useState } from 'react';
import type { BookEntry, BookResponse } from '../../../shared/protocol/api.ts';
import { addDays, weekdayOf, type DateKey } from '../../../shared/time/calendar.ts';
import type { Platform } from '../../platform/platform.ts';
import { COPY } from '../copy.ts';
import { Numero } from '../game/Chrome.tsx';
import { BackIcon, QuillIcon } from '../icons.tsx';
import { Seal, ToolStars, type SealState } from '../ornaments.tsx';
import { StatusScreen } from '../StatusScreen.tsx';
import { useThumbnail } from './thumbnails.ts';
import './book-screen.css';

type Shelf = 'dailies' | 'traps';

/** The seal struck beside each entry: blind until played, half while under way. */
const STATUS_SEAL: Record<BookEntry['status'], SealState> = { unplayed: 'empty', playing: 'lens', clean: 'gilt', torn: 'split' };

/** A specimen's four gilt photo corners. */
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

/** The ledger's weeks run Monday to Sunday, as the difficulty climbs and the week's best trap closes it. */
const MONDAY = 1;
const DAYS_IN_WEEK = 7;

const mondayOf = (key: DateKey): DateKey => addDays(key, -((weekdayOf(key) - MONDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK));

/** "16 November": the server's UTC date, written out the same on every device. */
const dayAndMonth = (key: DateKey): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

type Week = { readonly monday: DateKey; readonly entries: readonly BookEntry[] };

/** Entries (newest first) grouped into their weeks, newest week first. */
const weeksOf = (entries: readonly BookEntry[]): Week[] => {
  const weeks: { monday: DateKey; entries: BookEntry[] }[] = [];
  for (const entry of entries) {
    const monday = mondayOf(entry.sheet.dateKey);
    const last = weeks[weeks.length - 1];
    if (last?.monday === monday) last.entries.push(entry);
    else weeks.push({ monday, entries: [entry] });
  }
  return weeks;
};

/** A small finished sheet, tipped into the Book with four photo corners. Never tilted: its hairlines stay true. */
const Specimen = ({ entry }: { readonly entry: BookEntry }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useThumbnail(canvas, entry.sheet.id, entry.sheet.spec);
  return (
    <span className="book__specimen">
      <canvas ref={canvas} className="book__thumb" aria-hidden />
      {CORNERS.map((corner) => (
        <span key={corner} className="book__corner" data-corner={corner} aria-hidden />
      ))}
    </span>
  );
};

/** What the row says about how the sheet has fared, and where it stands in the race for Sunday. */
const metaOf = (entry: BookEntry): string => {
  const { sheet, status, stats } = entry;
  if (stats.hands === 0) return COPY.book.beFirst;
  const parts = [COPY.book.status[status], COPY.book.hands(stats.hands)];
  if (sheet.kind === 'trap') parts.push(COPY.trap.caught(stats.caught, stats.hands));
  return parts.join(' · ');
};

/** One ledger entry: Nº in the gutter, the specimen, the day in italic, and a dotted leader to its seal. */
const Row = ({
  entry,
  today,
  onPlay,
}: {
  readonly entry: BookEntry;
  readonly today: boolean;
  readonly onPlay: (id: string) => void;
}) => {
  const { sheet, status } = entry;
  const daily = sheet.kind === 'daily';
  const title = daily ? sheet.weekday : COPY.trap.by(sheet.author ?? 'someone');
  const subtitle = sheet.author && daily
    ? COPY.trap.sheetOfWeek(sheet.author)
    : sheet.name
      ? COPY.communityName(sheet.name)
      : sheet.paletteName;
  return (
    <li>
      <button
        type="button"
        className="book__row"
        onClick={() => onPlay(sheet.id)}
        data-status={status}
        data-kind={sheet.kind}
        data-today={today || undefined}
      >
        {today ? <span className="visually-hidden">{COPY.book.today}</span> : null}
        {daily ? (
          <span className="book__no">
            <span className="book__no-sign">
              <Numero />
            </span>{' '}
            <span className="figures">{sheet.number}</span>
          </span>
        ) : null}
        <Specimen entry={entry} />
        <span className="book__text">
          <span className="book__line">
            <span className="book__title">{title}</span>
            <span className="book__leader" aria-hidden />
            <Seal state={STATUS_SEAL[status]} />
          </span>
          <span className="book__subtitle">
            <span className="book__stars">
              <ToolStars count={sheet.spec.stars} label={COPY.stars(sheet.spec.stars)} />
            </span>{' '}
            {subtitle}
          </span>
          <span className="book__meta">{metaOf(entry)}</span>
          {entry.inTheRunning ? <span className="book__running">{COPY.book.inTheRunning}</span> : null}
        </span>
      </button>
    </li>
  );
};

type Props = {
  readonly platform: Platform;
  readonly onBack: () => void;
  readonly onPlay: (sheetId: string) => void;
  readonly onCompose: () => void;
};

/** The Book: every past sheet and every recent trap, each playable again. */
export const BookScreen = ({ platform, onBack, onPlay, onCompose }: Props) => {
  const [book, setBook] = useState<BookResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [shelf, setShelf] = useState<Shelf>('dailies');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    platform
      .loadBook()
      .then((loaded) => !cancelled && setBook(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [platform, attempt]);

  const retry = (): void => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  if (!book) return <StatusScreen kind={failed ? 'failed' : 'loading'} onRetry={retry} onBack={onBack} />;
  const entries = shelf === 'dailies' ? book.dailies : book.traps;
  // Dailies come newest first, and the newest is today's: it carries the ribbon.
  const todayId = book.dailies[0]?.sheet.id ?? null;

  return (
    <main className="book">
      <header className="book__header">
        <button type="button" className="icon-button" onClick={onBack} aria-label={COPY.book.back}>
          <BackIcon />
        </button>
        <div className="plaque">
          <p className="plaque__wordmark label">{COPY.book.eyebrow}</p>
          <h1 className="plaque__title">
            <span className="plaque__day">{COPY.book.title}</span>
          </h1>
        </div>
      </header>

      <div className="book__shelves" role="tablist">
        {(['dailies', 'traps'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={shelf === key}
            className="book__shelf"
            onClick={() => setShelf(key)}
          >
            {key === 'dailies' ? COPY.book.dailies : COPY.book.traps}
            <span className="book__count figures">{(key === 'dailies' ? book.dailies : book.traps).length}</span>
          </button>
        ))}
      </div>

      {shelf === 'traps' ? <p className="book__rule">{COPY.book.sundayRule}</p> : null}

      {entries.length === 0 ? (
        <p className="book__empty">{COPY.book.noTraps}</p>
      ) : (
        weeksOf(entries).map((week) => (
          <section key={week.monday} className="book__week">
            <h2 className="book__week-head label">{COPY.book.weekOf(dayAndMonth(week.monday))}</h2>
            <ol className="book__list">
              {week.entries.map((entry) => (
                <Row key={entry.sheet.id} entry={entry} today={shelf === 'dailies' && entry.sheet.id === todayId} onPlay={onPlay} />
              ))}
            </ol>
          </section>
        ))
      )}

      <button type="button" className="button button--primary book__compose" onClick={onCompose}>
        <QuillIcon size={18} />
        {COPY.trap.set}
      </button>
    </main>
  );
};
