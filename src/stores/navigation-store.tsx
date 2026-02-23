// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createContext, useContext, type ParentComponent } from "solid-js"
import { createStore } from "solid-js/store"

export type Route = "login" | "menu" | "chat" | "create-channel" | "dm-inbox" | "dm-chat"

type NavigationContextValue = {
  route: () => Route
  history: () => Route[]
  navigate: (to: Route) => void
  goBack: () => void
}

const NavigationContext = createContext<NavigationContextValue>()

type NavigationProviderProps = {
  initialRoute?: Route
}

export const NavigationProvider: ParentComponent<NavigationProviderProps> = (props) => {
  const initialRoute = () => props.initialRoute ?? "menu"
  const [state, setState] = createStore({
    route: initialRoute(),
    history: [initialRoute()] as Route[],
  })

  const navigate = (to: Route) => {
    setState((prev) => ({
      ...prev,
      route: to,
      history: [...prev.history, to],
    }))
  }

  const goBack = () => {
    setState((prev) => {
      const nextHistory = prev.history.length > 1 ? prev.history.slice(0, -1) : prev.history
      const nextRoute = nextHistory[nextHistory.length - 1] ?? prev.route
      return {
        ...prev,
        history: nextHistory,
        route: nextRoute,
      }
    })
  }

  return (
    <NavigationContext.Provider
      value={{
        route: () => state.route,
        history: () => state.history,
        navigate,
        goBack,
      }}
    >
      {props.children}
    </NavigationContext.Provider>
  )
}

export const useNavigation = () => {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider")
  }
  return context
}
