import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Route } from "./index.js";

interface NavigationContextType {
  route: Route;
  navigate: (to: Route) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a Router");
  }
  return context;
}

interface RouterProps {
  initialRoute?: Route;
  children: ReactNode;
}

export function Router({ initialRoute = "menu", children }: RouterProps) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [history, setHistory] = useState<Route[]>([initialRoute]);

  const navigate = useCallback((to: Route) => {
    setRoute(to);
    setHistory((prev) => [...prev, to]);
  }, []);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      const previousRoute = newHistory[newHistory.length - 1];
      setRoute(previousRoute);
      return newHistory;
    });
  }, []);

  return (
    <NavigationContext.Provider value={{ route, navigate, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
}
