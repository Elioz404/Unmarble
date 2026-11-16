# UNMARBLE

*Every sheet remembers how it was made.*

## What it is

UNMARBLE is a daily puzzle about reading time backwards.

Every day the subreddit receives one marbled sheet: a ruled, striped paper on which a few drops of ink fell and a stylus dragged through the water. You don't paint it. You **unpaint** it. Find the move that happened last, undo it, and keep going until the stripes run straight again.

The rules fit in three lines:

1. **The only perfectly round drop fell last.** Tap it and it sinks back into the water; everything underneath relaxes.
2. **Nothing round? Something stroked the water after.** Look for the fold in the stripes and drag along it, against its point.
3. **Two drops of the same ink?** Read their two centres.

Misread the sheet and the paper tears: you keep a small scar, and the sheet shows you *which* later move gave the order away. Three tears and the sheet gives way, then it replays how it was really made, step by step, so you always learn the answer.

## How to play

- Open today's post (or the pinned **Atelier** post, which always shows today's sheet).
- The first time, three tiny lessons (about 40 seconds) teach the three readings.
- **Tap** a drop to draw it back. **Drag** along a fold to undo a stroke.
- The **Lens** (once per sheet) briefly shows where the water moved. Using it is marked on your result.
- A clean sheet lifts out of the bath. Your result card shows your marks (● correct, ○ tear), your time, your standing among everyone who played today, and your streak.

## The daily rhythm

The week has a shape, like a crossword's:

| Day | Moves | What it asks |
|---|---|---|
| Monday ★ | 4 | the round drop, and one buried fold |
| Tuesday ★★ | 5 | a drop squeezed into a crescent |
| Wednesday ★★ | 5 | two folds crossing: which is on top? |
| Thursday ★★★ | 6 | a stroke on top, and a drop that only *looks* round |
| Friday ★★★★ | 6–7 | two drops of the same ink touching |
| Saturday ★★★★★ | 7–8 | everything, on livelier stripes |
| Sunday ★★★ | 5–6 | a calmer mixed sheet |

Every sheet is generated fresh each day and **checked before anyone sees it**: a rule-reading robot must be able to solve it without a single mistake, each covered move must carry a mark a human can see, and every drop must stay big enough to tap. There are no guessing games and no unfair sheets.

## The community

- **Everyone gets the same sheet each day.** You're compared with your subreddit, not the whole internet.
- **Name the sheet.** Each daily post has a pinned comment asking *"What does this sheet look like?"* Reply with up to three words. The best-voted reply names the sheet in the post card. Nothing is generated: the names come from people, in normal Reddit comments that you can report.
- **Scars are shared.** Once you finish, you can see where everyone else tore the sheet today ("58% tore the ochre").
- **Streaks** count consecutive days of finished sheets.

## For moderators

- Installing the app creates today's post and a pinned **Atelier** post. A new sheet is posted every day at 00:00 UTC.
- Menu actions: *post today's sheet now* (subreddit menu) and *clear this sheet's name* (post menu, for any name you don't want).
- Names must be short replies to the pinned comment. Removed or spam comments never count, and the app filters common profanity.

## Privacy

The app stores, per subreddit: your moves on each sheet (to resume and verify results), your rank on each sheet, and your streak. Attempt data expires after 60 days. Nothing is shared outside the subreddit, and no data is sent to third parties.

---

## Technical notes

**Stack:** Devvit Web 0.15.3, React 19, Hono, TypeScript (strict), WebGL2 with a CPU fallback.

### Architecture

```
src/
  shared/      Pure TypeScript, no platform APIs. Runs on client, server and in tests.
    marbling/    Exact marbling transforms (Lu & Jaffer, "Mathematical Marbling") and pull-back sampling
    puzzle/      Moves, evidence (marks), analysis bots, weekly templates, generator, lessons
    game/        Rules as a pure reducer, gesture resolution, blot explanations, scoring
    render/      The shading model shared by the CPU rasteriser and the GLSL shader
    sheet/       Ground patterns, colour science (OKLab, CVD simulation), the palette catalogue
    protocol/    Client/server contract and validators for every untrusted payload
    config.ts    Every tunable number, in one place
  client/
    render/      WebGL2 fragment-shader renderer, CPU renderer, static painter
    game/        GameController (presentation model), scene, overlay, specimen
    platform/    Platform port, with reddit-platform (Devvit) and lab-platform (browser only)
    ui/          React views and the design system (tokens.css)
  server/
    core/        SheetService, AttemptService, PostService, NamingService behind a Store port
    reddit/      The Reddit port: every Devvit Reddit call the app makes
    routes/      /api (public, validated) and /internal (triggers, scheduler, menu)
tools/         Sheet preview tool (renders PNG strips of every solving step)
```

**Physics.** A drop at *c* with radius *r* maps *p ↦ c + (p − c)·√(1 + r²/|p − c|²)*. A stroke maps *p ↦ p + u·αλ/(|(p − b)·n| + λ)*. Both are exact bijections, so each frame is rendered by pulling every pixel back through the moves. Undoing the top move restores the previous state exactly. Every animation only changes an amount (a drop's radius, a stroke's shift), so each frame is a physically valid sheet.

**Fairness contract.** Every published sheet is checked by `validateSheet`:
- the *golden rule*: at every step, the top move is pristine and every other move carries a readable mark of at least 1.2× the human threshold;
- seams must cut the stripes steeply;
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

**Lab URLs:** `lab.html?date=2026-12-03` (a specific day), `?fresh` (forget local progress), `?view=card` (the feed card), `?view=board` (the card at 288/400/720 px).

### Platform notes

- Devvit Journeys events are dropped until an app is allowlisted at review. This app is uploaded for the hackathon, not published, so it does not rely on analytics.
- While the app is unapproved, `runAs: 'USER'` acts as the app account for everyone except its owner. Naming therefore uses comments people write themselves, read by triggers.
