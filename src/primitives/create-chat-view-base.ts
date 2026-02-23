// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createEffect, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { createClaudeSdkSession } from "./create-claude-sdk-session"
import { LOCAL_COMMAND_EVENTS } from "../lib/commands"
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
  const [isDetached, setIsDetached] = createSignal(false)
  const [detachedLines, setDetachedLines] = createSignal(0)
  const [tooltipHeight, setTooltipHeight] = createSignal(0)
  const [permissionSelectedIndex, setPermissionSelectedIndex] = createSignal(0)
  const claude = createClaudeSdkSession()
  const ccChannelByTurnId = new Map<string, string>()

  claude.onCcEvent((event) => {
    const manager = options.channelManager()
    if (!manager) return

    let channel = ccChannelByTurnId.get(event.turnId)

    // Bind each turn to the channel active when that turn starts.
    if (event.event === "question") {
      const activeChannel = options.currentChannel()
      if (!activeChannel) return
      channel = activeChannel
      ccChannelByTurnId.set(event.turnId, activeChannel)
    }

    if (!channel) {
      const activeChannel = options.currentChannel()
      if (!activeChannel) return
      channel = activeChannel
    }

    void manager.sendCcMessage(channel, event.content, {
      turn_id: event.turnId,
      session_id: event.sessionId,
      event: event.event,
      tool_name: event.toolName,
      is_error: event.isError,
    })

    if (event.event === "result") {
      ccChannelByTurnId.delete(event.turnId)
    }
  })

  const isClaudeMode = createMemo(() => claude.isActive() || claude.isConnecting())
  createEffect(() => {
    if (!isClaudeMode()) {
      ccChannelByTurnId.clear()
    }
  })
  const listHeight = createMemo(() => Math.max(1, options.listHeight() - tooltipHeight()))
  const combinedMessages = createMemo(() =>
    [...options.baseMessages(), ...claude.messages()].sort((a, b) => {
      const aThinking = Boolean(a.attributes?.claude?.thinking)
      const bThinking = Boolean(b.attributes?.claude?.thinking)
      // Keep the temporary Claude thinking indicator pinned to the bottom.
      if (aThinking !== bThinking) return aThinking ? 1 : -1
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
    })
  )
  const permissionMessageId = createMemo(() => {
    const stack = claude.pendingPermissions()
    if (stack.length === 0) return null
    const top = stack[stack.length - 1]
    const msgs = claude.messages()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const perm = msgs[i].attributes?.claude?.permissionRequest
      if (perm && perm.requestId === top.requestId) return msgs[i].id
    }
    return null
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
    claude.pendingPermission()?.requestId
    setPermissionSelectedIndex(0)
  })

  // Keyboard handler — returns true if key was consumed
  const handleClaudeKeys = (key: { ctrl?: boolean; name: string }): boolean => {
    if (key.ctrl && key.name === "c" && isClaudeMode()) {
      claude.interrupt()
      return true
    }

    if (claude.pendingPermission()) {
      if (key.name === "up" || key.name === "k") {
        setPermissionSelectedIndex(0)
        return true
      }
      if (key.name === "down" || key.name === "j") {
        setPermissionSelectedIndex(1)
        return true
      }
      if (key.name === "return") {
        void claude.respondToPendingPermission(permissionSelectedIndex() === 0 ? "allow" : "deny")
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
  const handleClaudeCommand = async (eventType: string, _data: any): Promise<boolean> => {
    if (eventType === LOCAL_COMMAND_EVENTS.claudeEnter) {
      await claude.start()
      return true
    }
    if (eventType === LOCAL_COMMAND_EVENTS.claudeExit) {
      claude.stop("Claude Code mode disabled.")
      return true
    }
    return false
  }

  // Wraps a normal send function to route to claude when in claude mode
  const wrapSendMessage = (normalSend: (msg: string) => Promise<void>) => {
    return async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed) return
      if (isClaudeMode()) {
        await claude.sendMessage(trimmed, options.username() || "you")
        return
      }
      await normalSend(trimmed)
    }
  }

  const wrapTypingStart = (normalStart: () => void) => {
    return () => {
      if (isClaudeMode()) return
      normalStart()
    }
  }

  const wrapTypingStop = (normalStop: () => void) => {
    return () => {
      if (isClaudeMode()) return
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

  return {
    // Claude
    claude,
    isClaudeMode,
    combinedMessages,
    permissionMessageId,
    permissionSelectedIndex,

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
    handleClaudeKeys,
    handleClaudeCommand,
    wrapSendMessage,
    wrapTypingStart,
    wrapTypingStop,
    handleTooltipHeightChange,
    resetScroll,
  }
}
