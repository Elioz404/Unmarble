# UNMARBLE

*Every sheet remembers how it was made.*

## What it is

UNMARBLE is a daily puzzle about reading time backwards.

Every day the subreddit receives one marbled sheet: a ruled, striped paper on which a few drops of ink fell and a stylus dragged through the water. You don't paint it. You **unpaint** it. Find the move that happened last, undo it, and keep going until the stripes run straight again.

Three forms of mark, three readings:

1. **Drops.** The only perfectly round drop fell last. Tap it and it sinks back into the water; everything underneath relaxes.
2. **Folds.** Nothing round? Something stroked the water after. Find the fold in the stripes and drag along it, against its point.
3. **Swirls.** The water turned around an eye. If the eye is undisturbed, the swirl came last: circle it with your finger, against the turn.

Two drops of the same ink? Read their two centres.

Misread the sheet and the paper tears: you keep a small scar, and the sheet shows you *which* later move gave the order away. Three tears and the sheet gives way, then it replays how it was really made, step by step, so you always learn the answer.

## How to play

- Open today's post (or the pinned **Atelier** post, which always shows today's sheet).
- The first time you meet a form, a ten-second lesson teaches it — the first visit covers drops and folds, and the first sheet with a swirl teaches swirls.
- **Tap** a drop to draw it back. **Drag** along a fold to undo it. **Circle** a swirl's eye, against its turn.
- The **Lens** (once per sheet) briefly shows where the water moved. Using it is marked on your result.
- A clean sheet lifts out of the bath. Your result card shows your marks (● correct, ○ tear), your time, your standing among everyone who played today, and your streak.

## The daily rhythm

The week has a shape, like a crossword's:

| Day | Moves | What it asks |
|---|---|---|
| Monday ★ | 4 | the round drop, and one buried fold |
| Tuesday ★★ | 5 | a drop squeezed into a crescent (on bands or a grid) |
| Wednesday ★★ | 5 | two folds crossing: which is on top? |
| Thursday ★★★ | 6 | a fold on top, and a drop that only *looks* round |
| Friday ★★★★ | 6–7 | two drops of the same ink touching, and a swirl |
| Saturday ★★★★★ | 7–8 | everything, on waves, chevrons or rings |
| Sunday ★★★ | 5–6 | **the week's best community trap**, credited to its maker — or a mixed sheet with a swirl |

The paper itself changes too: plain bands, finely combed stripes, a grid (a ruler in both directions), chevrons, waves and concentric rings, across 28 colourways that never repeat within four weeks.

Every sheet is generated fresh each day and **checked before anyone sees it**: a rule-reading robot must be able to solve it without a single mistake, each covered move must carry a mark a human can see, and every drop must stay big enough to tap. There are no guessing games and no unfair sheets.

## The community

- **Everyone gets the same sheet each day.** You're compared with your subreddit, not the whole internet.
- **Set a trap.** Once a day, marble a sheet of your own on today's paper — drops, folds and swirls — to catch other players. The editor checks your trap live against the same fairness rules as the daily sheets (it names the move at fault and outlines it on the paper), and the server checks it again. Your trap is posted to the subreddit under your name; you see how many hands it catches. The week's most-played trap that was devious but fair becomes **Sunday's sheet**.
- **The Book.** Every past daily sheet and every recent trap, with a thumbnail and your result on each. Old sheets stay playable any time.
- **Streak flair (opt-in).** Tick a box on your result card to show *"Unmarbled 12 days running"* next to your name in the subreddit. Untick it and your previous flair comes back. If a moderator gives you a flair meanwhile, theirs wins and the app stops updating yours.
- **Name the sheet.** Each daily post has a pinned comment asking *"What does this sheet look like?"* Reply with up to three words. The best-voted reply names the sheet in the post card. Nothing is generated: the names come from people, in normal Reddit comments that you can report.
- **Scars are shared.** Once you finish, you can see where everyone else tore the sheet today ("58% tore the ochre").
- **Streaks** count consecutive days of finished sheets.

## For moderators

- Installing the app creates today's post and a pinned **Atelier** post. A new sheet is posted every day at 00:00 UTC.
- Menu actions: *post today's sheet now* (subreddit menu) and *clear this sheet's name* (post menu, for any name you don't want).
- Names must be short replies to the pinned comment. Removed or spam comments never count, and the app filters common profanity.
- Traps are ordinary posts by the app, titled with their maker's name: remove one like any post (or mark it as spam) and it leaves the Book and the Sunday selection; approve it again and it comes back. Users banned from the subreddit can't set traps.
- Only signed-in players count toward choosing Sunday's trap, and a trap's maker never counts on their own trap.

## Privacy

The app stores, per subreddit: your moves on each sheet (to resume and verify results), your rank on each sheet, your streak, the traps you set, and — only if you opt in to flair — your username to keep the flair up to date. Attempt data expires after 60 days. Nothing is shared outside the subreddit, and no data is sent to third parties.

---

## Technical notes

**Stack:** Devvit Web 0.15.3, React 19, Hono, TypeScript (strict), WebGL2 with a CPU fallback.

### Architecture

```
src/
  shared/      Pure TypeScript, no platform APIs. Runs on client, server and in tests.
    marbling/    Exact marbling transforms (Lu & Jaffer, "Mathematical Marbling"): drops, folds, swirls
    puzzle/      Moves, evidence (marks), analysis bots, the sheet contract and its diagnoses,
                 gesture separability, weekly templates, generator, lessons, traps
    game/        Rules as a pure reducer, gesture resolution, blot explanations, scoring
    render/      The shading model shared by the CPU rasteriser and the GLSL shader
    sheet/       Ground patterns, colour science (OKLab, CVD simulation), the palette catalogue
    protocol/    Client/server contract and validators for every untrusted payload
    config.ts    Every tunable number, in one place
  client/
    render/      WebGL2 fragment-shader renderer, CPU renderer, static painter
    game/        GameController and ComposerController (presentation models), scene, overlay, specimen
    platform/    Platform port, with reddit-platform (Devvit) and lab-platform (browser only)
    ui/          React views and the design system (tokens.css)
  server/
    core/        Sheets (incl. Sunday featuring), attempts, posts, naming, traps, Book, flair — behind a Store port
    app-services.ts  The service graph, pure (tests compose it over in-memory fakes)
    reddit/      The Reddit port: every Devvit Reddit call the app makes
    routes/      /api (public, validated) and /internal (triggers, scheduler, menu)
tools/         Sheet preview tool (renders PNG strips of every solving step)
```

**Physics.** A drop at *c* with radius *r* maps *p ↦ c + (p − c)·√(1 + r²/|p − c|²)*. A stroke maps *p ↦ p + u·αλ/(|(p − b)·n| + λ)*. A swirl rotates each point around its eye by *τλ/(|p − c| + λ)*. All three are exact bijections, so each frame is rendered by pulling every pixel back through the moves. Undoing the top move restores the previous state exactly. Every animation only changes an amount (a drop's radius, a stroke's shift), so each frame is a physically valid sheet.

**Fairness contract.** Every published sheet is checked by `validateSheet`:
- the *golden rule*: at every step, the top move is pristine and every other move carries a readable mark (an oval or ring for drops, a bent seam for folds, a disturbed eye for swirls) of at least 1.2× the human threshold;
- seams must cut the stripes steeply and run across enough of the paper to read;
- a drop never lands inside an earlier drop of its own ink (the two would read as one blob);
- *gesture separability*: every reasonable swipe (short, long, or the whole seam, slightly off-line) or circle (off-centre, squashed) that undoes the top move must resolve to it, and a straight swipe is never read as a circle, so a blot is always a misreading, never a misaim;
- every drop stays visible and tappable at every step;
- the coverage and composition are balanced;
- the sheet has the features its weekday template promises.

**Server authority.** The client applies actions optimistically. The server replays the same log through the same reducer, so a reload can't undo a tear and a result can only be what the rules allow. The daily seed is an HMAC of the date with a secret created at install, so future sheets can't be computed from this public source.

### Commands

```bash
npm install
npm run check      # types, lint, unit tests
npm run lab        # the game in a plain browser at http://localhost:5199/lab.html
npm run sheets -- 2026-11-25 7   # print and render a week of sheets to previews/
npm run dev        # devvit playtest (requires `npm run login` first)
npm run deploy     # checks, then devvit upload
```

**Lab URLs:** `lab.html?date=2026-12-03` (a specific day), `?fresh` (forget local progress), `?view=card` (the feed card), `?view=board` (the card at 288/400/720 px). In the lab you play as a local "lab-player": traps, the Book and flair all work offline in the browser.

### Platform notes

- Devvit Journeys events are dropped until an app is allowlisted at review. This app is uploaded for the hackathon, not published, so it does not rely on analytics.
- While the app is unapproved, `runAs: 'USER'` acts as the app account for everyone except its owner. Naming therefore uses comments people write themselves, read by triggers.
