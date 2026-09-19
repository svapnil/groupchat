// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { expect, test } from "bun:test"
import { buildTitleRequest, nameThreadOnce, normalizeThreadTitle, parseTitleOutput, pollThreadTitle } from "../src/agent/core/thread-title"

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve() }

test("waits for a title and retries delivery without publishing a fallback", async () => {
  const timers: Array<() => void> = []
  const published: string[] = []
  let title: string | null = null
  let deliveries = 0
  let done = false
  const stop = pollThreadTitle({
    read: async () => title,
    publish: async (value) => { if (++deliveries === 1) throw Error("offline"); published.push(value) },
    schedule: (cb) => { timers.push(cb); return () => {} },
    onDone: () => { done = true },
  })
  await flush()
  expect(published).toEqual([])
  title = "  Session\n titles  "
  timers.shift()!(); await flush()
  expect(done).toBe(false)
  timers.shift()!(); await flush()
  expect(published).toEqual(["Session titles"])
  expect(done).toBe(true)
  expect(timers).toHaveLength(0)
  stop()
})

test("cancellation prevents an in-flight read from publishing", async () => {
  let resolve!: (value: string) => void
  let published = false
  const stop = pollThreadTitle({
    read: () => new Promise((r) => { resolve = r }),
    publish: async () => { published = true },
    schedule: () => () => {}, onDone: () => {},
  })
  stop(); resolve("Late title"); await flush()
  expect(published).toBe(false)
})

test("an unnameable thread stops after a bounded number of reads", async () => {
  const timers: Array<() => void> = []
  let reads = 0
  let done = false
  pollThreadTitle({
    read: async () => { reads++; throw Error("unsupported") },
    publish: async () => { throw Error("must not publish") },
    schedule: (cb) => { timers.push(cb); return () => {} },
    onDone: () => { done = true },
  })
  await flush()
  while (timers.length) { timers.shift()!(); await flush() }
  expect(reads).toBe(30)
  expect(done).toBe(true)
})

test("normalizes controls and caps Unicode titles without breaking surrogate pairs", () => {
  expect(normalizeThreadTitle("\u001bTitle\n here")).toBe("Title here")
  expect(normalizeThreadTitle("😀".repeat(121))).toBe("😀".repeat(120))
  expect(normalizeThreadTitle(" \n ")).toBeNull()
})

test("parses a naming turn's JSON and refuses anything that is not a title", () => {
  expect(parseTitleOutput('{"title": "Conversation titles for Claude"}')).toBe("Conversation titles for Claude")
  expect(parseTitleOutput('```json\n{"title": "Fenced title"}\n```')).toBe("Fenced title")
  expect(parseTitleOutput('Here you go: {"title": "Preambled title"}')).toBe("Preambled title")
  expect(parseTitleOutput('{"title": "  spaced \\n title  "}')).toBe("spaced title")

  // A bare line is accepted, but prose and refusals are not titles.
  expect(parseTitleOutput("Bare line title")).toBe("Bare line title")
  expect(parseTitleOutput("I can't help with that.\nWhat else would you like?")).toBeNull()
  expect(parseTitleOutput("x".repeat(121))).toBeNull()
  expect(parseTitleOutput('{"title": ""}')).toBeNull()
  expect(parseTitleOutput('{"title": 12}')).toBeNull()
  expect(parseTitleOutput("")).toBeNull()
})

test("truncates an overlong opening prompt so naming stays a cheap turn", () => {
  const request = buildTitleRequest("x".repeat(7000))
  expect(request.startsWith("Name this conversation from its opening message:\n")).toBe(true)
  expect(request).toHaveLength("Name this conversation from its opening message:\n".length + 6000)
})

test("names a thread once per id, and re-keys when the thread changes", async () => {
  const calls: Array<[string, string]> = []
  let release!: (value: string) => void
  const name = nameThreadOnce(async (threadId: string, prompt: string) => {
    calls.push([threadId, prompt])
    return new Promise<string>((r) => { release = r })
  })

  // Concurrent polls of the same thread share one turn.
  const first = name("thread-1", "Opening prompt")
  const second = name("thread-1", "Opening prompt")
  expect(calls).toHaveLength(1)
  release("Shared title")
  expect(await first).toBe("Shared title")
  expect(await second).toBe("Shared title")

  // A different thread is named on its own, never served the previous name.
  const third = name("thread-2", "Another prompt")
  expect(calls).toEqual([["thread-1", "Opening prompt"], ["thread-2", "Another prompt"]])
  release("Second title")
  expect(await third).toBe("Second title")
})
