// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Shared types for the TUI chat application.
 * Adapted from extension/webview/lib/types.ts
 */

export interface MessageAttributes {
  /** Extensible map for message metadata */
  [key: string]: unknown;
  claude?: ClaudeMessageMetadata;
  codex?: CodexMessageMetadata;
  cc?: CcEventMetadata;
  cx?: CxEventMetadata;
  bash?: BashEventMetadata;
  /**
   * Thread replies on a top-level message — the TUI only reads the length to
   * show a "{N} replies" indicator (no thread view). Server-managed.
   */
  thread_replies?: ThreadReply[];
}

export interface ThreadReply {
  username: string;
  message_id: string;
}

export type BashEventKind = "prompt" | "output"
export type BashCommandStatus = "running" | "completed" | "failed"

export interface BashEventMetadata {
  command_id: string;
  event: BashEventKind;
  status?: BashCommandStatus;
  exit_code?: number;
  cwd?: string;
  events?: BashEventMetadata[];
  contents?: string[];
}

export type AgentEventType =
  | "question"
  | "thinking"
  | "tool_call"
  | "tool_progress"
  | "tool_result"
  | "text_stream"
  | "text"
  | "result";

export type CcEventType = AgentEventType
export type CxEventType = AgentEventType

export interface CcEventMetadata {
  turn_id: string;
  session_id?: string;
  event: CcEventType;
  tool_name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  output_tokens?: number;
  elapsed_seconds?: number;
  stop_reason?: string | null;
  events?: CcEventMetadata[];
  contents?: string[];
}

export interface CxEventMetadata {
  turn_id: string;
  session_id?: string;
  event: CxEventType;
  tool_name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  output_tokens?: number;
  elapsed_seconds?: number;
  stop_reason?: string | null;
  events?: CxEventMetadata[];
  contents?: string[];
}

/**
 * `agent:run` push from the backend on the `user:{id}` topic — sent when one
 * of the user's agents is @-mentioned and this TUI is connected with
 * `--remote`. `run_id` is the correlation id for all subsequent
 * `agent:event` pushes.
 */
export interface AgentRunRequest {
  run_id: string;
  agent: { id: string; name: string; harness: string; prompt: string | null };
  prompt: string;
  room: string;
  root_message_id: string;
  run_message_id: string;
  /** "start" = fresh conversation; "continue" = follow-up turn in an existing one. */
  mode: "start" | "continue";
  /**
   * The conversation's harness thread to resume on "continue" (codex
   * thread/resume). Null = no prior session ever started; begin fresh, still
   * threaded under the same conversation root.
   */
  resume_thread_id: string | null;
}

/**
 * `agent:steer` push from the backend on the `user:{id}` topic — inject
 * `prompt` into the RUNNING turn of run `run_id` (the requester replied in
 * the conversation thread while the agent was still working). If the turn
 * already ended, the TUI answers with the control event `run/steer_rejected`
 * (echoing the prompt) and the backend re-dispatches it as a continuation.
 */
export interface AgentSteerRequest {
  run_id: string;
  prompt: string;
}

/**
 * `agent:event` push from the TUI to the backend on the `user:{id}` topic — a
 * native harness app-server notification forwarded true-to-source (`{method,
 * params}`), correlated by `run_id`. The backend validates+bounds it per-harness
 * (Chat.Harness): the method is whitelisted and `params` is size/length/depth-
 * capped, then persisted (durable methods) and broadcast verbatim. The
 * harness-agnostic control method `run/failed` (`params: { message }`)
 * terminates the run.
 */
export interface AgentRunEventPayload {
  run_id: string;
  method: string;
  params: Record<string, unknown>;
}

export type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AgentContentBlock[]; is_error?: boolean }
  | { type: "thinking"; thinking: string; budget_tokens?: number };

export type ClaudeContentBlock = AgentContentBlock
export type CodexContentBlock = AgentContentBlock

export interface ClaudeResultMetadata {
  subtype: string;
  isError: boolean;
  numTurns?: number;
  totalCostUsd?: number;
  durationMs?: number;
}

export type ClaudePermissionDestination = "session" | "userSettings"

export type ClaudePermissionUpdate =
  | { type: "addRules"; rules: Array<{ toolName: string; ruleContent?: string }>; behavior: "allow" | "deny" | "ask"; destination: ClaudePermissionDestination }
  | { type: "replaceRules"; rules: Array<{ toolName: string; ruleContent?: string }>; behavior: "allow" | "deny" | "ask"; destination: ClaudePermissionDestination }
  | { type: "removeRules"; rules: Array<{ toolName: string; ruleContent?: string }>; behavior: "allow" | "deny" | "ask"; destination: ClaudePermissionDestination }
  | { type: "setMode"; mode: string; destination: ClaudePermissionDestination }
  | { type: "addDirectories"; directories: string[]; destination: ClaudePermissionDestination }
  | { type: "removeDirectories"; directories: string[]; destination: ClaudePermissionDestination }

export interface ClaudeAskUserQuestionOption {
  label: string
  description?: string
}

export interface ClaudeAskUserQuestion {
  header?: string
  question: string
  options: ClaudeAskUserQuestionOption[]
  allowCustomInput?: boolean
}

export interface ClaudeAskUserQuestionState {
  questions: ClaudeAskUserQuestion[]
  answers: Record<string, string>
  activeQuestionIndex: number
  customInputQuestionIndex?: number | null
}

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  agentId?: string;
  description?: string;
  input: Record<string, unknown>;
  permissionSuggestions?: ClaudePermissionUpdate[];
  askUserQuestion?: ClaudeAskUserQuestionState;
  /** Set once the user responds or the request is cancelled */
  resolution?: "allowed" | "denied" | "cancelled";
}

export interface ClaudeMessageMetadata {
  parentToolUseId: string | null;
  contentBlocks: ClaudeContentBlock[];
  model?: string;
  stopReason?: string | null;
  streaming?: boolean;
  thinking?: boolean;
  interrupted?: boolean;
  outputTokens?: number;
  eventType?: "assistant" | "stream_event" | "streamlined_text" | "streamlined_tool_use_summary" | "tool_use_summary" | "result";
  result?: ClaudeResultMetadata;
  permissionRequest?: ClaudePermissionRequest;
}

export interface CodexMessageMetadata {
  parentToolUseId: string | null;
  contentBlocks: CodexContentBlock[];
  model?: string;
  stopReason?: string | null;
  streaming?: boolean;
  thinking?: boolean;
  interrupted?: boolean;
  outputTokens?: number;
  eventType?:
    | "assistant"
    | "stream_event"
    | "reasoning"
    | "tool_use"
    | "tool_result"
    | "result";
  result?: ClaudeResultMetadata;
}

export interface Message {
  id: string;
  username: string;
  content: string;
  timestamp: string;

  /** Message type - defaults to "user" for regular messages */
  type?: "user" | "system" | "claude-response" | "codex-response" | "cc" | "cx" | "bash_prompt" | "bash_output";

  /**
   * Set when this message is a thread reply: the id of the top-level message it
   * replies to. The TUI filters replies out of the top-level list (it has no
   * thread view) but still shows a "{N} replies" indicator on the parent.
   */
  parent_thread_id?: string;

  /** Optional attributes - only present when message has attributes */
  attributes?: MessageAttributes;
}

export interface User {
  username: string;
  user_id: number;
  online_at: string;
}

export interface Subscriber {
  user_id: number;
  username: string;
  role: "member" | "admin";
}

export interface SubscribersResponse {
  subscribers: Subscriber[];
  count: number;
}

export interface UserSearchResult {
  user_id: number;
  username: string;
}

export interface UserSearchResponse {
  users: UserSearchResult[];
  count: number;
}

export type AgentType = "claude" | "codex" | "cursor" | "windsurf" | null;

export interface PresenceState {
  [username: string]: {
    metas: Array<{
      phx_ref: string;
      username: string;
      user_id: number;
      online_at: string;
      current_agent: AgentType;
    }>;
  };
}

export interface PresenceDiff {
  joins: PresenceState;
  leaves: PresenceState;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type AuthState = "unauthenticated" | "authenticating" | "authenticated";

export interface Channel {
  id: string;
  slug: string;
  type: "public" | "private";
  name: string;
  description: string | null;
  seqNo?: number;
}

export interface ChannelsResponse {
  channels: {
    public: Channel[];
    private: Channel[];
  };
}

export interface CreateChannelResponse {
  channel: Channel;
  channels: {
    public: Channel[];
    private: Channel[];
  };
}

export interface UnreadCounts {
  [channelSlug: string]: number;
}

/**
 * Internal state for each channel in the ChannelManager.
 * Stores presence, typing indicators, and buffered real-time messages.
 */
export interface ChannelState {
  slug: string;
  presence: PresenceState;
  typingUsers: Set<string>;
  realtimeMessages: Message[];
}

/**
 * Callbacks for the ChannelManager.
 * Each callback includes the channelSlug to identify which channel the event came from.
 */
export interface ChannelManagerCallbacks {
  onMessage?: (channelSlug: string, message: Message) => void;
  onNonActiveChannelMessage?: (channelSlug: string, message: Message) => void;
  onPresenceState?: (channelSlug: string, state: PresenceState) => void;
  onPresenceDiff?: (channelSlug: string, diff: PresenceDiff) => void;
  onUserTyping?: (channelSlug: string, username: string, typing: boolean) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onError?: (error: string) => void;
  onChannelJoined?: (channelSlug: string, username: string) => void;
  onInvitedToChannel?: (channelSlug: string, invitedBy: string) => void;
  onUserInvitedToChannel?: (channelSlug: string, username: string, userId: number, invitedBy: string) => void;
  onRemovedFromChannel?: (channelSlug: string, removedBy: string) => void;
  onUserRemovedFromChannel?: (channelSlug: string, username: string, removedBy: string) => void;
  onChannelListChanged?: () => void;

  // Agent-run callbacks (user channel, `--remote` mode)
  onAgentRun?: (run: AgentRunRequest) => void;
  onAgentSteer?: (steer: AgentSteerRequest) => void;

  // DM callbacks
  onDmMessage?: (message: DmMessage) => void;
  onDmTypingStart?: (dmSlug: string, username: string) => void;
  onDmTypingStop?: (dmSlug: string, username: string) => void;

  // Global presence callbacks (status channel)
  onGlobalPresenceState?: (state: PresenceState) => void;
  onGlobalPresenceDiff?: (diff: PresenceDiff) => void;
}

// ============================================================================
// Direct Message Types
// ============================================================================

export interface DmMessage {
  id: string;
  dm_slug: string;
  username: string;
  content: string;
  sender_id: number;
  type?: "cc" | "cx" | "bash_prompt" | "bash_output";
  /** Set when this DM message is a thread reply (filtered from the top-level list). */
  parent_thread_id?: string;
  attributes?: MessageAttributes;
}

export interface DmConversation {
  channel_id: string;
  slug: string;
  other_user_id: number;
  other_username: string;
  last_activity_at: string;
  last_message_preview: string | null;
  unread_count: number;
  /**
   * True for an unsent draft conversation that has no backend channel yet.
   * Draft conversations have empty `slug`/`channel_id` and live only in local
   * state until the first message is sent (which materializes the DM).
   */
  isDraft?: boolean;
}

export interface DmConversationsResponse {
  conversations: DmConversation[];
}

export interface CreateDmResponse {
  channel_id: string;
  slug: string;
  other_user_id: number;
  other_username: string;
}
