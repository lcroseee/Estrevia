# Session Recordings — Enabled 2026-07 (SP-D, D6)

## What changed
`PostHogProvider` now initializes posthog-js with `disable_session_recording: false`,
`session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' }`,
and a `before_send` hook that scrubs birth-PII params out of recorded URLs.
Purpose: the CRO audit's open question — 100% of payers go silent after day one —
had zero investigation instrumentation. Recordings make it answerable.

## Masking rules (PII)
- `maskAllInputs: true` — every input value is masked, including birth date /
  time / place fields. Non-negotiable (CLAUDE.md PII rule).
- `[data-ph-mask]` — masks ALL descendant text of tagged elements. Currently
  tagged: `BirthDataForm` form root, `HeroCalculator` form root,
  `BirthDataFormStandalone` root (synastry), and the `DateInput` calendar
  popover root (`CalendarPopover` in `DateInput.tsx`). rrweb applies the
  selector by walking DOM ancestry (`closest()`), so tagging a container masks
  everything inside it **only for elements that are actual DOM descendants**.
- **Portal caveat (why the calendar popover is tagged separately):** rrweb
  masks by DOM ancestry, which a React **portal escapes**. `CalendarPopover`
  is rendered via `createPortal(..., document.body)`, so its DOM parent is
  `<body>`, NOT the birth-data form — a form-root `data-ph-mask` does NOT
  reach it, and its visible month/year label + highlighted birth day would
  record UNMASKED (the birth date is reconstructable). It therefore carries
  its own `data-ph-mask`. A single form-root tag does NOT cover portaled
  surfaces.
- **Rule going forward:** any new component that echoes birth data back as
  TEXT (not an input) must carry `data-ph-mask` on its container — and any
  PII surface rendered through a **portal, `Dialog`/`Popover`/`Tooltip`
  overlay, or otherwise reparented outside the form DOM subtree** needs its
  OWN `data-ph-mask` because `closest()` will not find the form's tag.

## Recorded-URL scrub (PII)
- rrweb `$snapshot` payloads embed `window.location.href` and the replay
  player displays it — on `/chart?bd=…&bt=…&place=…` that href is birth PII.
  Neither `sanitize_properties` (never runs on `$snapshot` events) nor the
  input/text masks reach it.
- The `before_send` hook in `PostHogProvider.tsx` (`scrubEventUrls`) strips
  `PII_PARAMS` (`bd/bt/ktb/lat/lon/place/tz`) from `$current_url` /
  `$session_entry_url` / `$referrer` / `$initial_referrer` on ALL events and
  rewrites `data.href` on rrweb Meta (type 4) / FullSnapshot (type 2) events
  inside `$snapshot_data`.
- **Residual risk (accepted, documented):** the scrub targets known
  URL-bearing fields. If a future page renders the PII URL into DOM
  content itself (e.g. an anchor `href` or visible text echoing
  `location.href`), the FullSnapshot DOM serialization would carry it —
  tag such surfaces `data-ph-mask` or extend the scrubber. posthog-js
  upgrades can also change payload shapes; re-run the replay-URL smoke
  check (see Verification) after any posthog-js version bump.

## Verification
- After deploy: open a recorded `/chart` replay in PostHog → Session replay
  and confirm the player's URL bar shows NO `bd`/`bt`/`lat`/`lon`/`place`
  values (T9 Step 3 smoke item).

## Known blind spots (accepted)
- Recording is consent-gated: posthog-js only initializes after the cookie
  banner is accepted. Visitors (including payers) who decline consent are
  invisible to recordings. If day-one-silence analysis stays empty, check
  consent-acceptance rate before concluding "no sessions happened".
- Sessions before this deploy are not retroactively recoverable.

## Ops
- Quota: PostHog free tier includes 5,000 recordings/month — verify current
  usage in PostHog → Settings → Usage BEFORE the prod deploy and set a
  billing limit alert if close.
- Viewing: PostHog → Session replay. Filter by `plan`/`locale` person props.
- Kill switch: flip `disable_session_recording` back to `true` and redeploy
  (no data migration involved).
