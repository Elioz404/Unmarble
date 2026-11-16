import { resetLab, resetLabProgress } from '../../platform/lab-platform.ts';
import './lab-controls.css';

/** Reloads the lab without `fresh`, so a reset is not repeated on every later reload. */
const reload = (): void => {
  const search = new URLSearchParams(window.location.search);
  search.delete('fresh');
  const query = search.toString();
  window.location.assign(query ? `?${query}` : window.location.pathname);
};

/**
 * Lab only: replay without clearing storage by hand. Never part of the game,
 * where an attempt is recorded by the server and cannot be undone.
 */
export const LabControls = () => (
  <aside className="lab-controls" aria-label="Lab controls">
    <button
      type="button"
      className="lab-controls__button"
      onClick={() => {
        resetLabProgress();
        reload();
      }}
      title="Forget every attempt; keep lessons and traps"
    >
      Restart
    </button>
    <button
      type="button"
      className="lab-controls__button"
      onClick={() => {
        resetLab();
        reload();
      }}
      title="Forget everything, lessons included"
    >
      Start over
    </button>
  </aside>
);
