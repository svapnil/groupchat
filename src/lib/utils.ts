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
