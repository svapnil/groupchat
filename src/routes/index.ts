export const ROUTES = ["login", "menu", "chat"] as const;
export type Route = (typeof ROUTES)[number];
