# Repo Organization Summary

This workspace is split between the root wall tools and the isolated BoulderWall detail viewer.

## Root Pages

- `ai_mode.html` - AI route workspace on localhost:8004.
- `wall_navigator.html` - multi-tool wall editor on localhost:8003.
- `run_ai_mode.bat` - launcher for AI mode.
- `run_navigator.bat` - launcher for the wall navigator.

## Mode Launchers

- `mode-launchers/cmd/ai-mode` - Go CLI for `ai_mode.html`.
- `mode-launchers/cmd/wall-navigator` - Go CLI for `wall_navigator.html`.
- `mode-launchers/cmd/isolated-wall-navigator` - Go CLI for `isolated-boulderwall-details/wall_navigator.html`.
- `mode-launchers/cmd/db-viewer` - Go CLI for `isolated-boulderwall-details/db_view.html`.
- `mode-launchers/traces/` - per-mode trace folders with `launcher.log` and `server.log`.

## Isolated Tools

- `isolated-boulderwall-details/server.py` - hardened static server with JSON/CSV summary endpoints.
- `isolated-boulderwall-details/wall_navigator.html` - isolated navigation and editing page.
- `isolated-boulderwall-details/db_view.html` - read-only database viewer.
- `isolated-boulderwall-details/run_website.bat` - launcher for the isolated navigator.
- `isolated-boulderwall-details/run_db_view.bat` - launcher for the isolated DB viewer.
- `isolated-boulderwall-details/run_cli.bat` - Go CLI launcher.

## Shared Data

- `docs/` - JSON, CSV, and calibration inputs used by the pages and backend.
- `src/` - TypeScript source for route generation and stickman simulation.
- `dist/` - built JS used by AI mode.

## Current Port Layout

- `8001` - isolated DB viewer.
- `8003` - root wall navigator.
- `8004` - root AI mode.
- `8000` - isolated wall navigator.

## Trace Layout

- Each mode launcher writes to `mode-launchers/traces/<mode>/<timestamp>/`.
- Each trace folder contains `launcher.log` for orchestration and `server.log` for server stdout/stderr.

## Notes

- The DB viewer now uses external CSS and JS assets.
- Root pages have distinct color themes and breakpoint handling for narrower windows.
- The launchers open the exact page path for each page instead of a generic root URL.
