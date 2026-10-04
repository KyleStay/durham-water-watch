# Project instructions

## Network access

The default Codex `workspace-write` sandbox may block outbound DNS even when the host network is healthy. On 2026-09-29, `github.com` failed to resolve in the default sandbox, while `git ls-remote origin HEAD` succeeded with a one-command network-permission request.

For a task that needs GitHub or official-source access, request network permission only for the specific command, with a clear justification. Do not change system DNS, `/etc/hosts`, or the Git remote, and do not add a persistent project-wide network allowance without approval.

For `npm run daily:update`, follow the automation memory and its daily guard: run at most once per local date, and never rerun after an attempt that day.

Run the read-only `npm run daily:preflight` before the command-specific network permission request. It checks clean `main`, dependencies, the persistent Eastern-date command attempt record, and updater lock ownership. Only a known local lock whose owner and all recorded child process groups are proven no longer running may be accepted by preflight and archived during permitted updater acquisition; unknown, ambiguous, or active locks remain blocking.

The updater refreshes and validates in a detached candidate worktree. Failed candidates and phase records under the Git common directory are diagnostic evidence, not permission to skip validation or rerun that day. Preserve them and user work. Validation failures must leave the primary worktree clean; push or publication failures may leave validated commits on clean `main` for the next day's fresh run. User-directed repairs can validate and publish an already fetched snapshot without repeating `daily:update` or changing its daily schedule.
