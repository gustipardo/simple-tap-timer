# Working Context (LLM)

Date: 2026-02-17  
Project: Obsidian vault at `/media/gustipardo/DATA/Projects/Test`

## Goal completed today
Update the `simple-tap-timer` plugin to:
1. Remove the chained flow based on `next`.
2. Make one timer per note run by default.
3. Allow exceptions with a per-block parameter (`independent`).
4. Remove existing `next:` lines from training notes.

## Files changed today
- `.obsidian/plugins/simple-tap-timer/main.js`
- `Gym with Rings and V02Max/Dia 1 TREN SUPERIOR.md`
- `Gym with Rings and V02Max/Dia 2 TREN INFERIOR.md`
- `Gym with Rings and V02Max/Dia 3 CORE + MOVILIDAD + COMPENSATORIO + CORRECTIVOS.md`
- `Gym with Rings and V02Max/Dia 4 TREN SUPERIOR VARIACIONES.md`
- `Gym with Rings and V02Max/Dia 5 TREN INFERIOR VARIACIONES.md`

## Updated behavior of `simple-tap-timer`

### Supported block
```tap-timer
id: <unique-id>
title: <visible-title>
independent: false
```

### Active parameters
- `id`: timer identifier.
- `title`: optional title.
- `independent`: boolean (default `false`).
  - `false`: standard timer (uses per-note exclusivity).
  - `true`: independent timer (can run in parallel).

### Main rule (new)
- When you start a timer with `independent: false`, the plugin automatically pauses other timers in the same note that also have `independent: false`.
- This means only one standard timer runs per note by default.

### Rule for independent timers
- Timers with `independent: true` can start without pausing others.
- Independent timers are not paused by the standard-timer exclusivity rule.

### Removed behavior
- `next` is no longer used.
- The behavior “stop one timer, start another” no longer exists.
- `next:` lines were removed from training notes.

## New block inserted by command
The command “Insert simple timer block” now inserts:
```tap-timer
title: New timer
id: <generated>
independent: false
```

## Compatibility and migration
- Legacy blocks that still contain `next:` do not break rendering, but the field has no effect.
- Recommended: keep only `id`, `title`, and `independent` to avoid confusion.

## Verification performed
- Plugin syntax validated with:
  - `node -c .obsidian/plugins/simple-tap-timer/main.js`
- Markdown cleanup checked:
  - no matches for `^next\s*:` in `*.md`.

## Note for future tasks
If another concurrency variant is required (for example, “maximum 2 timers per note” or exclusivity groups), the current base can be extended from `pauseOtherStandardTimersInNote`.

## Update 2026-02-18 (publish preparation)
- Refactored `.obsidian/plugins/simple-tap-timer/main.js` to be generic and English-first.
- Replaced hardcoded Spanish user-facing text with English defaults.
- Added label/message configurability via block parameters across:
  - `tap-timer`
  - `tap-timer-report`
  - `tap-timer-reset-all`
  - `tap-timer-save-session`
- Generalized save-session destination:
  - Supports `folder` + `file` parameters.
  - Supports `log` as full override path.
- Updated plugin manifest description to English.
- Added end-user documentation in `.obsidian/plugins/simple-tap-timer/README.md`.
