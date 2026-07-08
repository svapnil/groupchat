// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../src/lib/content-sanitizer"

describe("content-sanitizer", () => {
  test("neutralizes terminal control characters in plain text", () => {
    const input = "hello\x1b]2;pwnd\x07"
    expect(sanitizePlainMessageText(input)).toBe("hello␛]2;pwnd␇")
  })

  test("defangs markdown links by default", () => {
    const input = "[docs](https://Exämple.com/path?q=1)"
    expect(sanitizeMessageMarkdown(input)).toBe("docs (https&#58;//xn--exmple-cua.com/path?q=1)")
  })

  test("allows safe schemes when hyperlink policy is enabled", () => {
    const input = "[docs](https://example.com/path)"
    expect(sanitizeMessageMarkdown(input, { hyperlinkPolicy: { enabled: true } })).toBe("[docs](https://example.com/path)")
  })

  test("blocks unsafe schemes even when hyperlink policy is enabled", () => {
    const input = "[local](file:///tmp/demo.txt)"
    expect(sanitizeMessageMarkdown(input, { hyperlinkPolicy: { enabled: true } })).toBe("local (file&#58;///tmp/demo.txt)")
  })

  test("defangs bare urls when hyperlinks are disabled", () => {
    const input = "visit https://example.com now"
    expect(sanitizeMessageMarkdown(input)).toBe("visit https&#58;//example.com/ now")
  })
})
