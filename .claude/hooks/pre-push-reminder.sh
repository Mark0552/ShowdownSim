#!/usr/bin/env bash
# PreToolUse hook for Bash. When a `git push` is about to run, injects a
# reminder for Claude to verify CLAUDE.md is current before pushing.
# Does not block the push — just nudges. Always exits 0.
#
# Wired up via .claude/settings.local.json. Edit `/hooks` to disable.

set -e
cmd=$(jq -r '.tool_input.command' 2>/dev/null || true)

if echo "$cmd" | grep -qE 'git push'; then
    jq -nc --arg ctx 'Pre-push reminder: keep CLAUDE.md current.

1. Run `git log origin/main..HEAD --oneline` to see what is being pushed.
2. Run `git diff origin/main..HEAD -- CLAUDE.md` to check whether CLAUDE.md is already updated.
3. If the changes include new features, architectural shifts, new tables/columns, rule clarifications, or workflow rules NOT yet reflected in CLAUDE.md — update CLAUDE.md, stage it, and either amend the pending commit or add a follow-up commit before pushing.
4. For pure bug fixes / refactors / dep bumps with no architecture or rule changes, push as-is — do not pad the doc with churn.

This nudge does not block the push. The push will proceed regardless of your decision.' \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
fi

exit 0
