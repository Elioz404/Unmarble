import './feed-board.css';

/** Feed widths worth checking: narrow phone, wide phone, desktop feed. */
const WIDTHS = [288, 400, 720] as const;
/** Height of a "tall" inline post. */
const TALL_POST_PX = 512;

/** Lab-only review board: the feed card at the widths Reddit can give it. */
export const FeedBoard = ({ search }: { readonly search: URLSearchParams }) => {
  const query = new URLSearchParams(search);
  query.set('view', 'card');
  return (
    <main className="board">
      {WIDTHS.map((width) => (
        <figure key={width} className="board__frame">
          <iframe title={`Card at ${width}px`} src={`?${query.toString()}`} width={width} height={TALL_POST_PX} />
          <figcaption className="label">{width} px</figcaption>
        </figure>
      ))}
    </main>
  );
};
