import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { logger } from "./logger";

const encodeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const encodeChar = (char: string) => encodeMap[char] || char;

export const sanitizeTableText = (
  value: string | number | null | undefined
): string => {
  if (value === null || value === undefined) return "";
  const input = String(value);
  return input.replace(/[&<>"']/g, encodeChar);
};

export const appHealth = () => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    env: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
    lazyEnabled: import.meta.env.VITE_ENABLE_LAZY === "1",
  };
  logger.debug("appHealth", health);
  return health;
};

export const cn = (...args: ClassValue[]) => twMerge(clsx(...args));
