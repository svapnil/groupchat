type RenderControlOptions = {
  preserveNewlines?: boolean
  preserveTabs?: boolean
}

export type HyperlinkPolicy = {
  enabled?: boolean
  allowedSchemes?: readonly string[]
}

export type MarkdownSanitizerOptions = {
  hyperlinkPolicy?: HyperlinkPolicy
}

const DEFAULT_ALLOWED_SCHEMES = ["https", "http", "mailto"] as const
const C1_CONTROL_MIN = 0x80
const C1_CONTROL_MAX = 0x9f
const BIDI_CONTROL_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const MARKDOWN_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\n]+)\)/g
const MARKDOWN_AUTOLINK_RE = /<([A-Za-z][A-Za-z0-9+.-]*:[^>\s]+)>/g
const BARE_URL_RE = /\b((?:https?:\/\/|mailto:)[^\s<>()\[\]]+)/gi

function toVisibleControl(code: number): string {
  // Security posture: never pass raw control bytes through to the terminal.
  // Render control characters as visible glyphs/tokens so malicious intent stays observable.
  if (code <= 0x1f) {
    return String.fromCodePoint(0x2400 + code)
  }

  if (code === 0x7f) {
    return "\u2421"
  }

  return `<0x${code.toString(16).toUpperCase().padStart(2, "0")}>`
}

function neutralizeControlChars(input: string, options: RenderControlOptions = {}): string {
  // Security posture: neutralize terminal-interpreted C0/C1/DEL bytes before rendering.
  // Newlines/tabs are optionally preserved for readability; everything else becomes visible text.
  const preserveNewlines = options.preserveNewlines ?? true
  const preserveTabs = options.preserveTabs ?? true
  let output = ""

  for (const char of input) {
    const code = char.codePointAt(0)
    if (code === undefined) continue

    if (preserveNewlines && code === 0x0a) {
      output += char
      continue
    }

    if (preserveTabs && code === 0x09) {
      output += char
      continue
    }

    if (code <= 0x1f || code === 0x7f || (code >= C1_CONTROL_MIN && code <= C1_CONTROL_MAX)) {
      output += toVisibleControl(code)
      continue
    }

    output += char
  }

  return output
}

function stripBidiControls(input: string): string {
  // Security posture: remove bidi override/isolate controls to reduce visual spoofing and reordering attacks.
  return input.replace(BIDI_CONTROL_RE, "")
}

function defangMarkdownUrl(url: string): string {
  // Security posture: convert `scheme:` into non-clickable text when links are disallowed/untrusted.
  // This keeps the URL visible while preventing implicit activation by markdown renderers.
  const schemeMatch = url.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)
  if (!schemeMatch) return url

  const scheme = schemeMatch[1]
  const remainder = url.slice(scheme.length + 1)
  return `${scheme}&#58;${remainder}`
}

function parseMarkdownDestination(rawDestination: string): { url: string; title: string } {
  // Security posture: parse markdown destination conservatively so policy checks run on the actual URL part,
  // not mixed with optional title text.
  const trimmed = rawDestination.trim()
  if (!trimmed) return { url: "", title: "" }

  if (trimmed.startsWith("<")) {
    const closeIndex = trimmed.indexOf(">")
    if (closeIndex > 0) {
      return {
        url: trimmed.slice(1, closeIndex).trim(),
        title: trimmed.slice(closeIndex + 1).trim(),
      }
    }
  }

  const firstWhitespace = trimmed.search(/\s/)
  if (firstWhitespace === -1) {
    return { url: trimmed, title: "" }
  }

  return {
    url: trimmed.slice(0, firstWhitespace).trim(),
    title: trimmed.slice(firstWhitespace).trim(),
  }
}

function resolveHyperlinkPolicy(policy?: HyperlinkPolicy): { enabled: boolean; allowedSchemes: Set<string> } {
  // Security posture: default to hyperlink disabled for untrusted content;
  // when enabled, only explicitly allowlisted schemes are accepted.
  const enabled = policy?.enabled ?? false
  const allowedSchemes = new Set((policy?.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES).map((scheme) => scheme.toLowerCase()))
  return { enabled, allowedSchemes }
}

function canonicalizeUrl(url: URL): string {
  // Security posture: canonicalize URL output (lowercase scheme/host) before display/render decisions.
  // This reduces ambiguity and makes scheme/host checks and user-visible output consistent.
  const protocol = url.protocol.toLowerCase()
  if (protocol === "mailto:") {
    return `mailto:${url.pathname}${url.search}${url.hash}`
  }

  const host = url.hostname.toLowerCase()
  const port = url.port ? `:${url.port}` : ""
  return `${protocol}//${host}${port}${url.pathname}${url.search}${url.hash}`
}

function parseUrlCandidate(rawUrl: string): URL | null {
  // Security posture: strip bidi/control chars before URL parsing so hidden bytes cannot influence parsing/rendering.
  // Invalid URLs fail closed (`null`) and are treated as non-clickable text.
  const cleaned = rawUrl
    .replace(BIDI_CONTROL_RE, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()

  if (!cleaned) return null

  try {
    return new URL(cleaned)
  } catch {
    return null
  }
}

function sanitizeUrlForMarkdown(rawUrl: string, policy: { enabled: boolean; allowedSchemes: Set<string> }): {
  display: string
  hyperlinkUrl: string | null
} {
  // Security posture: separate what we display from what is clickable.
  // Display is always sanitized text; clickability is granted only when policy is enabled and scheme allowlisted.
  const visible = sanitizePlainMessageText(rawUrl, { preserveNewlines: false, preserveTabs: false })
  const parsed = parseUrlCandidate(rawUrl)
  if (!parsed) return { display: visible, hyperlinkUrl: null }

  const scheme = parsed.protocol.slice(0, -1).toLowerCase()
  const canonical = sanitizePlainMessageText(canonicalizeUrl(parsed), { preserveNewlines: false, preserveTabs: false })

  if (!policy.enabled || !policy.allowedSchemes.has(scheme)) {
    return { display: canonical, hyperlinkUrl: null }
  }

  return { display: canonical, hyperlinkUrl: canonical }
}

export function sanitizePlainMessageText(input: string, options: RenderControlOptions = {}): string {
  // Security posture: baseline terminal safety for any untrusted text payload.
  // Order matters: remove bidi controls first, then neutralize control bytes.
  return neutralizeControlChars(stripBidiControls(input), options)
}

export function sanitizeMessageMarkdown(markdown: string, options: MarkdownSanitizerOptions = {}): string {
  // Security posture: treat markdown as untrusted transport, not trusted presentation.
  // We sanitize text first, then enforce explicit hyperlink policy for markdown links/autolinks/bare URLs.
  const policy = resolveHyperlinkPolicy(options.hyperlinkPolicy)
  let output = sanitizePlainMessageText(markdown)

  output = output.replace(MARKDOWN_LINK_RE, (_match, _bang, rawLabel, rawDestination) => {
    const label = sanitizePlainMessageText(rawLabel)
    const { url, title } = parseMarkdownDestination(rawDestination)
    const sanitizedLink = sanitizeUrlForMarkdown(url, policy)

    if (sanitizedLink.hyperlinkUrl) {
      const safeTitle = title ? ` ${sanitizePlainMessageText(title)}` : ""
      return `[${label}](${sanitizedLink.hyperlinkUrl}${safeTitle})`
    }

    if (!sanitizedLink.display) return label
    return `${label} (${defangMarkdownUrl(sanitizedLink.display)})`
  })

  output = output.replace(MARKDOWN_AUTOLINK_RE, (_match, rawUrl) => {
    const sanitizedLink = sanitizeUrlForMarkdown(rawUrl, policy)
    if (sanitizedLink.hyperlinkUrl) {
      return `<${sanitizedLink.hyperlinkUrl}>`
    }
    return defangMarkdownUrl(sanitizedLink.display)
  })

  if (!policy.enabled) {
    output = output.replace(BARE_URL_RE, (rawUrl) => {
      const sanitizedLink = sanitizeUrlForMarkdown(rawUrl, policy)
      return defangMarkdownUrl(sanitizedLink.display)
    })
  }

  return output
}
