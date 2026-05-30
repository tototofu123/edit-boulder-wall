# Next Phase

## What Was Done

- Split the DB viewer into HTML, CSS, and JS assets.
- Added grouped filters, multi-sort controls, and read-only SQL presets.
- Added per-mode Go launchers with trace folders and launcher/server logs.
- Updated the launchers and repo docs to match the new port and mode layout.

## Next Phase TODO

1. Split `ai_mode.html` and `wall_navigator.html` into external CSS and JS files.
2. Add more SQL presets for common slices like category, grade range, and foot-friendly rows.
3. Rework the larger root pages into smaller mode-specific modules.
4. Add richer tracing metadata, such as launch duration and server readiness checks.
5. Clean up the launcher UX so each mode has a small help note or command line hint.
