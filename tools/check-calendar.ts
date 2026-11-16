/**
 * Pre-deploy check, run by `npm run deploy` before the upload: every recipe
 * calendar version that is not on the server yet must start at least
 * `ROTATION.versionLeadDays` days after today (UTC). The server announces
 * tomorrow's sheet a day ahead, so a version that starts sooner would make a
 * sheet that differs from what the previous server already announced.
 *
 *   npm run check:calendar
 *
 * `LIVE_VERSIONS` counts the versions an upload has already put on the
 * server. Raise it once an upload ships a new version; until then a later
 * deploy fails here, which is the safe way round.
 */
import { ROTATION } from '../src/shared/config.ts';
import { CALENDAR_VERSIONS } from '../src/shared/puzzle/calendar-recipes.ts';
import { addDays, dateKeyOf } from '../src/shared/time/calendar.ts';

/** How many of `CALENDAR_VERSIONS`, from the first, are already on the server. */
const LIVE_VERSIONS = 1;

const today = dateKeyOf(Date.now());
const earliest = addDays(today, ROTATION.versionLeadDays);
const pending = CALENDAR_VERSIONS.slice(LIVE_VERSIONS);
const late = pending.filter((version) => version.from < earliest);

for (const version of late) {
  console.error(
    `Calendar version from ${version.from} starts before ${earliest} (today + ${ROTATION.versionLeadDays}). ` +
      'Move its `from` to that day or later, or, if an upload already shipped it, raise LIVE_VERSIONS in tools/check-calendar.ts.',
  );
}
if (late.length === 0) {
  console.log(`Calendar: ${pending.length} new version(s), each starting on or after ${earliest}.`);
}
process.exitCode = late.length === 0 ? 0 : 1;
