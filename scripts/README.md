# Token Monitor profile card

This card combines the lifetime token total, the four largest tools by lifetime
usage, and 365 days of activity. The total includes all tools. Percentages use
the lifetime total; bar lengths are relative to the largest tool. Today uses the
live aggregate rather than the slower history snapshot. Dates follow
Asia/Shanghai.

The Windows host runs `run-token-monitor-sync.ps1` every hour and at login using
the scheduled task `TokenMonitor-GitHub-Profile`. Token Monitor must be running
in Host mode and GitHub CLI must remain authenticated. The updater reads the
existing local host credential and only sends it to loopback. It publishes two
SVG files, with no raw usage export, device details, session data, or costs.

Updates use the latest GitHub tree and change only the two generated SVG assets.
Unchanged cards do not create a commit. A failed data fetch preserves the last
published card. Concurrent GitHub changes are retained; force updates are never
used. The local checkout does not need to be clean for a scheduled update.

Local rendering: `node scripts/update-token-monitor.mjs`

Publish once: `node scripts/update-token-monitor.mjs --publish`

Validation: `node --test scripts/token-monitor-card.test.mjs`

The task log is `%LOCALAPPDATA%\TokenMonitorGitHub\sync.log`.
