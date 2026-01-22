import { useEffect, useRef, useCallback } from "react";
import { execSync } from "child_process";
import type { AgentType } from "../lib/types.js";
import type { ChannelManager } from "../lib/channel-manager.js";

const POLL_INTERVAL_MS = 2000;

function detectCurrentAgent(): AgentType {
  try {
    const result = execSync(`ps -p $(pgrep -x -n 'codex|claude') -o comm=`, {
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();

    if (result.includes("@openai/codex")) return "codex";
    if (result === "claude") return "claude";
    return null;
  } catch {
    return null;
  }
}

export function useAgentDetection(
  channelManager: ChannelManager | null,
  isConnected: boolean
) {
  const lastSentAgentRef = useRef<AgentType | undefined>(undefined);

  const broadcastAgentUpdate = useCallback(
    (agent: AgentType) => {
      if (!channelManager) return;
      channelManager.pushToAllChannels("update_current_agent", {
        current_agent: agent,
      });
    },
    [channelManager]
  );

  useEffect(() => {
    if (!channelManager || !isConnected) {
      lastSentAgentRef.current = undefined;
      return;
    }

    // Initial detection
    const initialAgent = detectCurrentAgent();
    if (
      lastSentAgentRef.current === undefined ||
      lastSentAgentRef.current !== initialAgent
    ) {
      lastSentAgentRef.current = initialAgent;
      broadcastAgentUpdate(initialAgent);
    }

    // Poll every 2 seconds
    const intervalId = setInterval(() => {
      const currentAgent = detectCurrentAgent();
      if (currentAgent !== lastSentAgentRef.current) {
        lastSentAgentRef.current = currentAgent;
        broadcastAgentUpdate(currentAgent);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [channelManager, isConnected, broadcastAgentUpdate]);
}
