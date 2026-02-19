import { describe, expect, test } from "bun:test"
import {
  calculateMaxVisibleMessages,
  calculateMiddleSectionHeight,
  calculateVisibleMessages,
} from "../../src/lib/layout"

type TestMessage = { id: string; username: string }

describe("layout helpers", () => {
  test("calculateMiddleSectionHeight enforces a minimum of 5 rows", () => {
    expect(calculateMiddleSectionHeight(6, 1)).toBe(5)
    expect(calculateMiddleSectionHeight(20, 1)).toBeGreaterThan(5)
  })

  test("calculateMaxVisibleMessages uses conservative message-with-header size", () => {
    expect(calculateMaxVisibleMessages(5)).toBe(2)
    expect(calculateMaxVisibleMessages(9)).toBe(4)
  })

  test("calculateVisibleMessages selects bottom slice based on height and scroll", () => {
    const messages: TestMessage[] = [
      { id: "1", username: "alice" },
      { id: "2", username: "alice" },
      { id: "3", username: "bob" },
    ]

    const atBottom = calculateVisibleMessages(messages, 3, 0)
    expect(atBottom.visibleMessages.map((m) => m.id)).toEqual(["2", "3"])
    expect(atBottom.prevMessage?.id).toBe("1")

    const scrolledUp = calculateVisibleMessages(messages, 3, 1)
    expect(scrolledUp.visibleMessages.map((m) => m.id)).toEqual(["1", "2"])
    expect(scrolledUp.prevMessage).toBeNull()
  })
})
