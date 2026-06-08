// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
export function compactJson(value: unknown, maxLength: number): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length > maxLength) return `${text.slice(0, maxLength)}...`
  return text
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function shortenPath(filePath: string): string {
  const parts = filePath.split("/")
  if (parts.length <= 3) return filePath
  return parts.slice(-3).join("/")
}

/**
 * Stable identifier for the calendar day a timestamp falls on, in the viewer's
 * local timezone. Used to detect day boundaries between messages. Returns "" for
 * an invalid timestamp.
 */
export function localDayKey(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** English ordinal suffix for a day-of-month (handles the 11/12/13 teens). */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return "th"
  switch (n % 10) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

/** Full date with an ordinal day in the viewer's locale, e.g. "June 8th, 2026". */
export function formatFullDate(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ""
  const day = d.getDate()
  return d
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    .replace(String(day), `${day}${ordinal(day)}`)
}
