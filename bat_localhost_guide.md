# BAT Localhost Guide

## Launchers

- `run_navigator.bat` starts the root wall navigator through `mode-launchers/cmd/wall-navigator` on `http://localhost:8003/wall_navigator.html`.
- `run_ai_mode.bat` starts AI mode through `mode-launchers/cmd/ai-mode` on `http://localhost:8004/ai_mode.html`.
- `isolated-boulderwall-details/run_website.bat` starts the isolated wall navigator through `mode-launchers/cmd/isolated-wall-navigator` on `http://localhost:8000/wall_navigator.html`.
- `isolated-boulderwall-details/run_db_view.bat` starts the isolated DB viewer through `mode-launchers/cmd/db-viewer` on `http://localhost:8001/db_view.html`.

## Intent

Each launcher uses a different localhost port so browser sessions stay separate and page state does not collide across tools.

## Theme Mapping

- `8000` - isolated wall navigator, dark graphite with green-blue accents.
- `8001` - DB viewer, blue-violet data theme.
- `8003` - wall navigator, teal-forward editor theme.
- `8004` - AI mode, violet-indigo route generation theme.

## Notes

- The launchers should always open the exact page path, not just the port root.
- If a port is already busy, stop the existing process before relaunching that page.
- The Go launchers write trace logs to `mode-launchers/traces/<mode>/<timestamp>/launcher.log` and `server.log`.
