export const ROUTES = ["login", "menu", "chat", "create-channel", "dm-inbox", "dm-chat"] as const;
export type Route = (typeof ROUTES)[number];
