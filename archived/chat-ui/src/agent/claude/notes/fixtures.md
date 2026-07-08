# Claude NDJSON Fixtures

Last updated: 2026-03-04

This note describes fixture inputs used to validate Claude event parsing, tool coverage, and rendering.

## Canonical Synthetic Fixture

Path:

- `tui/test/claude/fixtures/claude-all-tools.ndjson`

Coverage goals:

- all major Claude message categories used in current integration:
  - `system`, `keep_alive`, `stream_event`, `streamlined_text`, `streamlined_tool_use_summary`
  - `control_request`, `control_cancel_request`, `tool_progress`, `tool_use_summary`
  - `assistant`, `result`, `auth_status`
- control request subtypes:
  - `can_use_tool`
  - one unhandled subtype sample (`set_model`)
- stream event variants:
  - `message_start`
  - `content_block_delta.text_delta`
  - `content_block_delta.thinking_delta`
  - `message_delta`
- tool coverage aligned with current TUI helper handling:
  - `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Task`

Validation:

- `tui/test/claude/claude-fixture-coverage.test.ts` asserts this fixture remains comprehensive.

## Retained Real Fixtures

Path:

- `tui/test/claude/fixtures/real-websearch-and-bash.ndjson`
- `tui/test/claude/fixtures/real-control-cancel-attempt.ndjson`

Coverage goals:

- `real-websearch-and-bash.ndjson`:
  - real `stream_event` flow with partials (`message_start`, `content_block_*`, `message_delta`, `message_stop`)
  - `WebSearch` and `Bash` tool usage
  - `control_request.can_use_tool`
  - `rate_limit_event`
- `real-control-cancel-attempt.ndjson`:
  - `control_cancel_request`
  - `control_response`
  - paired `control_request.can_use_tool`

Observed gap in current real traces:

- no top-level `tool_progress`
- no top-level `tool_use_summary`
- no top-level `streamlined_tool_use_summary`

## Capturing Real NDJSON Traces

Script:

- `tui/scripts/claude/capture-ndjson.ts`

Example:

```bash
bun run scripts/claude/capture-ndjson.ts \
  --out test/claude/fixtures/real-websearch-and-bash.ndjson \
  --prompt "Use WebSearch twice, then run Bash: sleep 6 && echo done."
```

Notes:

- script launches `claude` with the same websocket stream-json transport used by the TUI
- captures raw incoming NDJSON from Claude to output file
- auto-allows `can_use_tool` by default (use `--no-auto-allow` to disable)
