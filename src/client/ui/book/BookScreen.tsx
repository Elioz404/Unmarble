import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookEntry, BookResponse } from '../../../shared/protocol/api.ts';
import { opsForPrefix } from '../../../shared/puzzle/moves.ts';
import { shadingPaletteOf } from '../../../shared/render/shading.ts';
import { getPalette } from '../../../shared/sheet/palettes.ts';
import type { Platform } from '../../platform/platform.ts';
import { useCpuSheet } from '../card/use-cpu-sheet.ts';
import { COPY } from '../copy.ts';
import { BackIcon, QuillIcon } from '../icons.tsx';
import { StatusScreen } from '../StatusScreen.tsx';
import './book-screen.css';

type Shelf = 'dailies' | 'traps';

const STATUS_GLYPH: Record<BookEntry['status'], string> = { unplayed: '', playing: '◐', clean: '●', torn: '○' };

/** A small finished sheet, as the Book shows it. */
const Thumbnail = ({ entry }: { readonly entry: BookEntry }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { spec } = entry.sheet;
  const frame = useMemo(
    () => ({
      ops: opsForPrefix(spec.moves, spec.moves.length),
      ground: spec.ground,
      palette: shadingPaletteOf(getPalette(spec.paletteId)),
      ghost: 0,
    }),
    [spec],
  );
  useCpuSheet(canvas, frame);
  return <canvas ref={canvas} className="book__thumb" aria-hidden />;
};

const Row = ({ entry, onPlay }: { readonly entry: BookEntry; readonly onPlay: (id: string) => void }) => {
  const { sheet, status, stats } = entry;
  const title = sheet.kind === 'trap' ? COPY.trap.by(sheet.author ?? 'someone') : `No. ${sheet.number} · ${sheet.weekday}`;
  const subtitle = sheet.name ?? sheet.paletteName;
  return (
    <li>
      <button type="button" className="book__row" onClick={() => onPlay(sheet.id)} data-status={status}>
        <Thumbnail entry={entry} />
        <span className="book__text">
          <span className="book__title">{title}</span>
          <span className="book__subtitle">
            <span className="book__stars">{'★'.repeat(sheet.spec.stars)}</span> {subtitle}
          </span>
          <span className="book__meta">
            {COPY.book.status[status]} · {COPY.book.hands(stats.hands)}
            {sheet.kind === 'trap' && stats.hands > 0 ? ` · ${COPY.trap.caught(stats.caught, stats.hands)}` : ''}
          </span>
        </span>
        <span className="book__glyph" aria-hidden>
          {STATUS_GLYPH[status]}
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

  useEffect(() => {
    let cancelled = false;
    platform
      .loadBook()
      .then((loaded) => !cancelled && setBook(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (!book) return <StatusScreen kind={failed ? 'failed' : 'loading'} />;
  const entries = shelf === 'dailies' ? book.dailies : book.traps;

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

      {entries.length === 0 ? (
        <p className="book__empty">{COPY.book.noTraps}</p>
      ) : (
        <ol className="book__list">
          {entries.map((entry) => (
            <Row key={entry.sheet.id} entry={entry} onPlay={onPlay} />
          ))}
        </ol>
      )}

      <button type="button" className="button button--primary book__compose" onClick={onCompose}>
        <QuillIcon size={18} />
        {COPY.trap.set}
      </button>
    </main>
  );
};
