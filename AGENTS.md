# Project instructions

## Network access

The default Codex `workspace-write` sandbox may block outbound DNS even when the host network is healthy. On 2026-09-29, `github.com` failed to resolve in the default sandbox, while `git ls-remote origin HEAD` succeeded with a one-command network-permission request.

For a task that needs GitHub or official-source access, request network permission only for the specific command, with a clear justification. Do not change system DNS, `/etc/hosts`, or the Git remote, and do not add a persistent project-wide network allowance without approval.

For `npm run daily:update`, follow the automation memory and its daily guard: run at most once per local date, and never rerun after an attempt that day.
