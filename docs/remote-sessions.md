# Remote session lifecycle

A run is one request from Groupchat. A session is the local Codex or Claude
process that can serve several successive runs in the same conversation.
Completing a run releases its concurrency slot and detaches its event callbacks;
it does not necessarily stop the process.

## Reuse and limits

- Successful sessions stay idle for five minutes after the last completed turn.
- Each authenticated connection retains at most ten idle sessions, across all
  agents and harnesses. When full, it evicts the least recently used idle session.
- Active runs retain the existing limit of ten per agent. An idle session does
  not occupy an active slot. A conversation cannot have two active runs.
- Reuse requires the same agent, harness, working directory, room, conversation
  root, saved harness thread ID, and agent instructions.
- A cache miss, expired session, changed instructions, or dead process uses the
  existing cold-resume path. A fresh conversation never borrows another
  conversation's context.
- Failed or timed-out runs are disposed. Connection loss, logout, organization
  changes, and normal application exit dispose both active and idle sessions.
  Reconnection can create a new runner and restore saved conversations.

The time limit and idle cap are local runner defaults, not protocol fields.
Changes to CLI configuration files, credentials, or environment outside Groupchat
are not watched; restart Groupchat to guarantee that every session reloads them.
Retaining processes also retains their memory and potentially their background
tools until eviction or shutdown. No latency or token-cost savings are assumed:
the optimization avoids local startup and conversation restoration on cache hits.

## Harness transports

Codex's [App Server documentation](https://learn.chatgpt.com/docs/app-server)
separates `thread/start` / `thread/resume` from `turn/start`. Once loaded, the
same thread can receive subsequent `turn/start` requests over the existing
transport. Remote sessions forward native events without collecting the unused
local UI transcript. Completed turn IDs are tracked in a bounded history to
discard delayed events, and child-thread completion cannot finish the parent run.

Claude's [CLI reference](https://code.claude.com/docs/en/cli-reference) documents
`--input-format stream-json`, `--output-format stream-json`, and `--resume`.
Its `--max-turns` entry also describes queued inputs starting subsequent turns.
The runner keeps stdin open and writes another NDJSON user message for each
follow-up. A `result` ends a run; the process remains usable. Stream writes are
awaited so input failures reach the runner. See also the
[programmatic usage guide](https://code.claude.com/docs/en/headless) for session
resumption, streaming output, background tasks, and process termination.

## Ownership and event routing

`RemoteSessionPool` owns each process and its reactive scope. Its stable harness
callbacks dispatch through the listeners of the currently attached run. Idle
notifications are dropped, while idle process failures evict the entry. Each new
run receives `run/thread_started`, including when the thread ID comes from the
cache rather than a fresh harness initialization.

`agent:run`, `agent:steer`, and `agent:event` payloads stay the same. Web and other
clients continue to receive events correlated by the current `run_id`. Warm
follow-ups emit no startup status artifact; starting or cold-resuming a process
still emits the existing `system/status` messages.

Steering still targets only active runs. If completion occurs while a steer write
is in flight, the process is retired instead of cached: that write might otherwise
start an extra turn in a session assigned to a different run. A rejected steer
uses the existing continuation path. Failed prompt writes are not automatically
replayed, because the harness may already have accepted the input.

Tests cover both harnesses through the shared runner, including reuse, event
rebinding, expiry, eviction, configuration changes, failures, shutdown, concurrent
conversations, and the steer/completion race. Transport tests verify successive
turns, stale Codex events, broken stdout, and asynchronous Claude input failures.
