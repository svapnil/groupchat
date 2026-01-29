import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type StatusMessageType = "error" | "info";

export interface StatusMessage {
  text: string;
  type: StatusMessageType;
}

interface StatusMessageContextValue {
  message: StatusMessage | null;
  pushMessage: (text: string, type?: StatusMessageType, duration?: number) => void;
  clearMessage: () => void;
}

const StatusMessageContext = createContext<StatusMessageContextValue | null>(null);

const DEFAULT_DURATION = 3000;

export function StatusMessageProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearMessage = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(null);
  }, []);

  const pushMessage = useCallback(
    (text: string, type: StatusMessageType = "info", duration: number = DEFAULT_DURATION) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setMessage({ text, type });

      // Auto-clear after duration
      if (duration > 0) {
        timeoutRef.current = setTimeout(() => {
          setMessage(null);
          timeoutRef.current = null;
        }, duration);
      }
    },
    []
  );

  return (
    <StatusMessageContext.Provider value={{ message, pushMessage, clearMessage }}>
      {children}
    </StatusMessageContext.Provider>
  );
}

export function useStatusMessage(): StatusMessageContextValue {
  const context = useContext(StatusMessageContext);
  if (!context) {
    throw new Error("useStatusMessage must be used within a StatusMessageProvider");
  }
  return context;
}
