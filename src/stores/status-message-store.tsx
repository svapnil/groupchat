import { createContext, createSignal, useContext, type ParentComponent } from "solid-js"

export type StatusMessageType = "error" | "info"

export type StatusMessage = {
  text: string
  type: StatusMessageType
}

type StatusMessageContextValue = {
  message: () => StatusMessage | null
  pushMessage: (text: string, type?: StatusMessageType, duration?: number) => void
  clearMessage: () => void
}

const StatusMessageContext = createContext<StatusMessageContextValue>()

const DEFAULT_DURATION = 3000

export const StatusMessageProvider: ParentComponent = (props) => {
  const [message, setMessage] = createSignal<StatusMessage | null>(null)
  let timeout: ReturnType<typeof setTimeout> | null = null

  const clearMessage = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    setMessage(null)
  }

  const pushMessage = (
    text: string,
    type: StatusMessageType = "info",
    duration: number = DEFAULT_DURATION
  ) => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }

    setMessage({ text, type })

    if (duration > 0) {
      timeout = setTimeout(() => {
        setMessage(null)
        timeout = null
      }, duration)
    }
  }

  return (
    <StatusMessageContext.Provider value={{ message, pushMessage, clearMessage }}>
      {props.children}
    </StatusMessageContext.Provider>
  )
}

export const useStatusMessage = () => {
  const context = useContext(StatusMessageContext)
  if (!context) {
    throw new Error("useStatusMessage must be used within a StatusMessageProvider")
  }
  return context
}
