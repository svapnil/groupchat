// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createEffect, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { createLocalAgentSessions } from "../agent/core/local-agent-sessions"
import type { LocalAgentSessionEntry } from "../agent/core/types"
import {
  isAgentExitCommandEvent,
  parseAgentIdFromEnterEvent,
} from "../lib/commands"
import { getAgentColorById, getAgentDisplayNameById } from "../lib/constants"
import type { InputMode } from "../lib/input-mode"
import { getRuntimeCapabilities } from "../lib/runtime-capabilities"
import type { ConnectionStatus, Message } from "../lib/types"
import type { ChannelManager } from "../lib/channel-manager"

export type CreateChatViewBaseOptions = {
  baseMessages: Accessor<Message[]>
  listHeight: Accessor<number>
  connectionStatus: Accessor<ConnectionStatus>
  username: Accessor<string | null>
  channelManager: Accessor<ChannelManager | null>
  currentChannel: Accessor<string | null>
}

export function createChatViewBase(options: CreateChatViewBaseOptions) {
  const runtimeCapabilities = getRuntimeCapabilities()
  const [isDetached, setIsDetached] = createSignal(false)
  const [detachedLines, setDetachedLines] = createSignal(0)
  const [tooltipHeight, setTooltipHeight] = createSignal(0)
  const [pendingActionSelectedIndex, setPendingActionSelectedIndex] = createSignal(0)
  const [activeAgentId, setActiveAgentId] = createSignal<string | null>(null)

  const agentSessions = createLocalAgentSessions(runtimeCapabilities)
  const defaultAgentSession = agentSessions[0]?.session ?? null
  const agentEventChannelByTurnKey = new Map<string, string>()

  const getAgentSession = (agentId: string | null): LocalAgentSessionEntry | null => {
    if (!agentId) return null
    const session = agentSessions.find((entry) => entry.id === agentId)
    return session ?? null
  }

  const getTurnKey = (agentId: string, turnId: string) => `${agentId}:${turnId}`
  const isAgentAvailable = (agentId: string) =>
    agentSessions.some((entry) => entry.id === agentId && entry.isAvailable())

  const bindAgentEventBridge = (entry: LocalAgentSessionEntry) => {
    if (!entry.session.onEvent) return

    entry.session.onEvent((event) => {
      const manager = options.channelManager()
      if (!manager) return

      const eventAgentId = event.agentId || entry.id
      const turnKey = getTurnKey(eventAgentId, event.turnId)
      let channel = agentEventChannelByTurnKey.get(turnKey)

      // Bind each turn to the channel active when that turn starts.
      if (event.event === "question") {
        const activeChannel = options.currentChannel()
        if (!activeChannel) return
        channel = activeChannel
        agentEventChannelByTurnKey.set(turnKey, activeChannel)
      }

      if (!channel) {
        const activeChannel = options.currentChannel()
        if (!activeChannel) return
        channel = activeChannel
      }

      void manager.sendAgentEvent(channel, event.content, {
        turn_id: event.turnId,
        session_id: event.sessionId,
        event: event.event,
        tool_name: event.toolName,
        is_error: event.isError,
      })

      if (event.event === "result") {
        agentEventChannelByTurnKey.delete(turnKey)
      }
    })
  }

  agentSessions.forEach(bindAgentEventBridge)

  const activeAgent = createMemo(() => {
    const explicit = getAgentSession(activeAgentId())
    if (explicit && (explicit.session.isActive() || explicit.session.isConnecting())) {
      return explicit
    }

    return (
      agentSessions.find((entry) => entry.session.isActive() || entry.session.isConnecting()) ??
      null
    )
  })

  createEffect(() => {
    const active = activeAgent()
    const current = activeAgentId()
    if (active && current !== active.id) {
      setActiveAgentId(active.id)
      return
    }
    if (!active && current !== null) {
      setActiveAgentId(null)
    }
  })

  const isAgentMode = createMemo(() => Boolean(activeAgent()))

  const activePendingActionSession = createMemo(() => {
    const active = activeAgent()
    if (active?.session.pendingAction?.()) return active
    return (
      agentSessions.find((entry) => Boolean(entry.session.pendingAction?.())) ?? null
    )
  })

  const pendingAction = createMemo(() => activePendingActionSession()?.session.pendingAction?.() ?? null)

  const activeInputMode = createMemo<InputMode | null>(() => {
    const active = activeAgent()
    if (!active) return null

    const displayName = getAgentDisplayNameById(active.id)
    const accentColor = getAgentColorById(active.id) ?? "#FFA500"

    return {
      id: active.id,
      label: displayName,
      accentColor,
      placeholder: `${displayName} mode...`,
      helperText: `${displayName} mode: /exit to leave, Ctrl+C to interrupt`,
      pendingAction: Boolean(active.session.pendingAction?.()),
      pendingActionPlaceholder: "Awaiting permission decision...",
      pendingActionHelperText: "↑/↓ select Allow/Deny in message list • Enter to confirm",
    }
  })

  createEffect(() => {
    if (!isAgentMode()) {
      agentEventChannelByTurnKey.clear()
    }
  })

  const listHeight = createMemo(() => Math.max(1, options.listHeight() - tooltipHeight()))
  const combinedMessages = createMemo(() =>
    [
      ...options.baseMessages(),
      ...agentSessions.flatMap((entry) => entry.session.messages()),
    ].sort((a, b) => {
      const aThinking = agentSessions.some((entry) => entry.session.isThinkingMessage?.(a))
      const bThinking = agentSessions.some((entry) => entry.session.isThinkingMessage?.(b))
      // Keep temporary agent thinking indicators pinned to the bottom.
      if (aThinking !== bThinking) return aThinking ? 1 : -1
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
    })
  )

  const pendingActionMessageId = createMemo(() => {
    const session = activePendingActionSession()
    if (!session) return null

    const stack = session.session.pendingActions?.() ?? []
    if (stack.length === 0) return null
    const top = stack[stack.length - 1]
    return session.session.findPendingActionMessageId?.(top.requestId) ?? null
  })

  // Scroll management
  let messageScrollRef: ScrollBoxRenderable | undefined

  const setScrollRef = (ref: ScrollBoxRenderable) => {
    messageScrollRef = ref
  }

  const updateScrollMetrics = () => {
    if (!messageScrollRef) return
    const maxScroll = Math.max(0, messageScrollRef.scrollHeight - messageScrollRef.viewport.height)
    const remaining = Math.max(0, Math.round(maxScroll - messageScrollRef.scrollTop))
    setDetachedLines(remaining)
    setIsDetached(remaining > 0)
  }

  const scrollToBottom = () => {
    if (!messageScrollRef) return
    const maxScroll = Math.max(0, messageScrollRef.scrollHeight - messageScrollRef.viewport.height)
    messageScrollRef.scrollTo({ y: maxScroll, x: 0 })
  }

  // Auto-scroll on message changes
  createEffect(() => {
    const allMessages = combinedMessages()
    allMessages.length
    const last = allMessages[allMessages.length - 1]
    if (last) {
      last.content
    }
    listHeight()
    queueMicrotask(() => {
      if (!isDetached()) {
        scrollToBottom()
      }
      updateScrollMetrics()
    })
  })

  // Reset permission index on new permission
  createEffect(() => {
    pendingAction()?.requestId
    setPendingActionSelectedIndex(0)
  })

  // Keyboard handler — returns true if key was consumed
  const handleAgentKeys = (key: { ctrl?: boolean; name: string }): boolean => {
    const active = activeAgent()
    if (key.ctrl && key.name === "c" && active?.session.interrupt) {
      active.session.interrupt()
      return true
    }

    const pendingSession = activePendingActionSession()
    if (pendingSession?.session.pendingAction?.()) {
      if (key.name === "up" || key.name === "k") {
        setPendingActionSelectedIndex(0)
        return true
      }
      if (key.name === "down" || key.name === "j") {
        setPendingActionSelectedIndex(1)
        return true
      }
      if (key.name === "return") {
        void pendingSession.session.respondToPendingAction?.(
          pendingActionSelectedIndex() === 0 ? "allow" : "deny"
        )
        return true
      }
      return true
    }

    if (options.connectionStatus() !== "connected") return true
    if (!messageScrollRef) return false

    if (["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)) {
      if (messageScrollRef.handleKeyPress(key as any)) {
        updateScrollMetrics()
      }
      return true
    }

    return false
  }

  // Command handler — returns true if consumed
  const handleAgentCommand = async (eventType: string, data: any): Promise<boolean> => {
    const enterAgentId = parseAgentIdFromEnterEvent(eventType)
    if (enterAgentId) {
      const entry = getAgentSession(enterAgentId)
      if (!entry || !entry.isAvailable()) {
        const active = activeAgent()
        const target = active?.session ?? defaultAgentSession
        target?.appendError(`${enterAgentId} is not available in this runtime.`)
        return true
      }

      const active = activeAgent()
      if (active && active.id !== entry.id) {
        active.session.appendError(
          `Exit ${getAgentDisplayNameById(active.id)} mode before entering ${getAgentDisplayNameById(entry.id)} mode.`
        )
        return true
      }

      await entry.session.start()
      setActiveAgentId(entry.id)
      return true
    }

    if (isAgentExitCommandEvent(eventType)) {
      const target = activeAgent()
      if (!target) return true
      target.session.stop(`${getAgentDisplayNameById(target.id)} mode disabled.`)
      return true
    }

    return false
  }

  // Wraps a normal send function to route to the active local agent mode.
  const wrapSendMessage = (normalSend: (msg: string) => Promise<void>) => {
    return async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed) return
      const active = activeAgent()
      if (active) {
        await active.session.sendMessage(trimmed, options.username() || "you")
        return
      }
      await normalSend(trimmed)
    }
  }

  const wrapTypingStart = (normalStart: () => void) => {
    return () => {
      if (isAgentMode()) return
      normalStart()
    }
  }

  const wrapTypingStop = (normalStop: () => void) => {
    return () => {
      if (isAgentMode()) return
      normalStop()
    }
  }

  const handleTooltipHeightChange = (height: number) => {
    setTooltipHeight((prev) => (prev === height ? prev : height))
  }

  // Helper to reset scroll state (callers use for channel/conversation changes)
  const resetScroll = () => {
    setIsDetached(false)
    setDetachedLines(0)
    queueMicrotask(() => {
      scrollToBottom()
      updateScrollMetrics()
    })
  }

  const appendAgentError = (message: string, agentId?: string) => {
    if (agentId) {
      const session = getAgentSession(agentId)
      if (session) {
        session.session.appendError(message)
        return
      }
    }

    const active = activeAgent()
    if (active) {
      active.session.appendError(message)
      return
    }

    defaultAgentSession?.appendError(message)
  }

  return {
    activeAgentId,
    activeAgent,
    activeInputMode,
    pendingAction,
    isAgentMode,
    combinedMessages,
    pendingActionMessageId,
    pendingActionSelectedIndex,

    // Scroll
    isDetached,
    detachedLines,
    setScrollRef,
    scrollToBottom,
    updateScrollMetrics,

    // Layout
    listHeight,
    tooltipHeight,

    // Handlers
    handleAgentKeys,
    handleAgentCommand,
    wrapSendMessage,
    wrapTypingStart,
    wrapTypingStop,
    handleTooltipHeightChange,
    resetScroll,
    appendAgentError,

    // Availability
    isAgentAvailable,
  }
}
