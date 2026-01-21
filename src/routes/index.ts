export const ROUTES = ["login", "menu", "chat", "create-channel"] as const;
export type Route = (typeof ROUTES)[number];
