# Native audit: WorkoutLog (iOS), 2026-11-10

Scope: `components/WorkoutLog.tsx`, `components/workout/*` (SetRow, ExerciseBlock, WorkoutHeader, RestTimer, CardioSetRow, DurationSetRow, modals), `components/UndoBar.tsx`. Source-level audit against impeccable `audit.native.md` + `ios.md`; no Simulator run, so Dynamic Type and target findings marked "verify" need a device check.

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | 11 icon-only buttons and the reps/weight fields have no VoiceOver label |
| 2 | Performance | 3 | Workout clock re-renders the whole 2,560-line WorkoutLog every second (children are memoized) |
| 3 | Appearance & Theming | 4 | Theme tokens throughout; only `shadowColor: '#000'` literals |
| 4 | Platform Conformance | 3 | Custom header and sheets, but iOS-shaped; swipe gesture deliberately off |
| 5 | Adaptivity | 3 | Portrait iPhone only by design; keyboard handled carefully; fixed 44pt heights may clip at the largest text sizes |
| **Total** | | **15/20** | **Good** |

## Findings

### P1
1. **Unlabeled icon-only buttons (11).** VoiceOver reads "button" with no name. WorkoutLog.tsx:1709 minimize (chevron-down), 1713 close, 2070 keyboard dismiss, 2104 RPE sheet close, 2178 set-type sheet close; ExerciseBlock.tsx:94 rest timer, 97 exercise menu (⋮); RestTimer.tsx:131 minimize, 134 stop, 174 pause/resume; WorkoutHeader.tsx:128 workout settings. Fix: `accessibilityRole="button"` + `accessibilityLabel` ("Minimize workout", "Exercise options", "Start rest timer", "Pause rest", ...). The pause button also needs its label to change with state.
2. **Reps and weight fields have no label.** SetRow.tsx:231, 248 (same pattern in CardioSetRow). VoiceOver announces the placeholder "—" or a bare number with no context. Fix: `accessibilityLabel={\`Set ${n} reps\`}` / `` `Set ${n} weight, ${unit}` ``.
3. **Exercise rest-timer and ⋮ menu buttons are about 28pt** (ExerciseBlock.tsx:266, `padding: spacing.xs` around a 20pt icon, no hitSlop). These are hit mid-set. Fix: 44×44 box or `hitSlop={8}`.

### P2
4. **Other small targets:** workout settings gear about 26pt (WorkoutHeader.tsx:346), rest timer −30s/+30s about 30pt tall (RestTimer.tsx:268), keyboard dismiss about 36pt (WorkoutLog.tsx:2377), header buttons are 60 wide but only icon-height tall (WorkoutLog.tsx:2271).
5. **Set-number badge and RPE cell aren't described.** SetRow.tsx:212 reads "1" with no role (it opens the set-type picker; should read "Set 1, Normal. Change set type", button). SetRow.tsx:263 RPE cell has no label or role.
6. **Dynamic Type at accessibility sizes (verify).** No `maxFontSizeMultiplier` anywhere in the app, and set-row inputs use fixed `height: 44`, the set badge a fixed `lineHeight: 14`. At AX sizes numbers likely clip. Fix: `minHeight` instead of `height`, and a cap (about 1.5–2×) on the dense set-row cells only.
7. **Clock re-renders the whole screen each second.** `setElapsed` in WorkoutLog.tsx:517 lives in the 2,560-line root, so every tick re-runs its render (memoized children skip work, the root doesn't). Fix: move the ticking display into a small `ElapsedClock` component that owns the interval. Verify with the React profiler first.

### P3
8. **Done sets dim to 50% opacity** (SetRow.tsx:349). In light mode the dimmed values fall to roughly 4:1. Consider `textSecondary` instead of opacity.
9. **Swipe-down is off on WorkoutLog** (DashboardStack.tsx:29). Deliberate: it would fight set-row swipes and scrolling, and minimize is one tap. Keep.

## Patterns
- Labels exist where someone thought about them (set checkbox with checked state, swipe delete, copy-previous, duration rows), but icon-only buttons consistently ship without one. A guardrail test (icon-only touchable needs `accessibilityLabel`) would stop the drift.
- Compact icon buttons use `padding: spacing.xs` as their whole hit area.

## Positive findings
- Set row: 44pt inputs, 48pt-wide checkbox with `accessibilityRole="checkbox"` and checked state, number pad for reps vs decimal pad for weight, copy-previous tap, labelled swipe delete with a full-swipe commit and a visible threshold.
- Reduce Motion: check pop and row collapse go through `motionSpring`/`motionTiming`.
- FlatList for exercises, `React.memo` on SetRow, ExerciseBlock and WorkoutHeader with stable callbacks.
- Deliberate keyboard handling (`automaticallyAdjustKeyboardInsets`, keyboard toolbar with Next).
- Theme tokens everywhere, PR hint in `colors.prGold`, safe-area insets on the header.
- Haptics on save and warnings.

## Fixed 2026-11-10
- P1 1–3 and P2 4–5: every icon-only button on the screen is labelled; reps, weight, cardio fields, set badge and RPE cell have labels; exercise header icons are 44×44; gear, header buttons and RPE/set-type closes got hitSlop; ±30s and keyboard dismiss are 44pt tall. Set-type names moved to `SET_TYPE_NAMES` in `workout/types.ts`.
- Found by the new test: MiniWorkoutBar's discard button labelled; the custom tab bar now has `tabbar`/`tab` roles and a selected state.
- Guardrail: `codeGuardrails.test.ts` "gives every icon-only button a VoiceOver label". 40 pre-existing unlabeled icon buttons in 17 other files are allowed at their current counts.
- Still open: P2 6 (Dynamic Type at AX sizes, needs a device), P2 7 (isolate the clock), P3 8.

## Recommended actions
1. [P1] `/impeccable harden WorkoutLog`: VoiceOver labels, roles and states for the 11 icon buttons, set inputs, set badge and RPE cell.
2. [P1] `/impeccable polish WorkoutLog`: 44pt targets for the exercise header icons, gear, ±30s, keyboard dismiss.
3. [P2] `/impeccable adapt WorkoutLog`: Dynamic Type at AX sizes (minHeight, scoped caps), checked on device.
4. [P2] `/impeccable optimize WorkoutLog`: isolate the elapsed clock.
5. `/impeccable polish`: final pass.
