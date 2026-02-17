# Project Objective: Timer Plugin for Obsidian Mobile

## 1. Context
A simple way is needed to track time inside an Obsidian Mobile note without leaving the reading/editing flow.

## 2. Problem
Obsidian does not provide a native, direct-in-note timer that starts with one tap and stops with another tap.

## 3. General objective
Build a general Obsidian Mobile plugin that shows a simple one-tap timer: tap once to start and tap again to stop.

## 4. Specific objectives
- Provide a reusable timer inside Obsidian notes.
- Allow start/stop with the same touch control.
- Clearly show elapsed time and current state.
- Keep a fast, readable mobile experience with minimal steps.

## 5. Initial functional scope (MVP)
- Insert a timer into a note.
- Single start/stop toggle button.
- Real-time display of elapsed time.
- State indicator: running or stopped.
- Basic state persistence after reopening note/app (when supported by platform).

## 6. Expected usage flow
1. The user opens a note in Obsidian Mobile.
2. The user taps the timer to start.
3. The user taps again to stop.
4. The user checks the recorded time.

## 7. Success criteria
- The timer can be used without leaving the note.
- Interaction is immediate: one tap to start and one tap to stop.
- Time and status are clearly visible.
- The plugin works correctly on Obsidian Mobile.

## 8. Constraints and considerations
- Prioritize compatibility with Obsidian Mobile.
- Keep a low-complexity touch interface.
- Maintain stable behavior during continuous use.
