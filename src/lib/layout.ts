// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
export const LAYOUT_HEIGHTS = {
  inputBox: 4,
  statusBar: 3,
  linesPerMessage: 1,
  linesPerMessageWithHeader: 2,
} as const;

export function calculateMiddleSectionHeight(
  terminalRows: number,
  topPadding: number
): number {
  const { inputBox, statusBar } = LAYOUT_HEIGHTS;
  return Math.max(5, terminalRows - topPadding - inputBox - statusBar);
}

export function calculateMaxVisibleMessages(middleSectionHeight: number): number {
  // Use linesPerMessageWithHeader for conservative estimate (scroll bounds)
  // Actual visible count is calculated dynamically in MessageList
  return Math.floor(middleSectionHeight / LAYOUT_HEIGHTS.linesPerMessageWithHeader);
}

/**
 * Calculate which messages fit in the available height, accounting for headers.
 * Works backwards from the scroll position to determine the visible slice.
 */
export function calculateVisibleMessages<T extends { username: string }>(
  messages: T[],
  height: number,
  scrollOffset: number
): { visibleMessages: T[]; prevMessage: T | null } {
  const { linesPerMessage, linesPerMessageWithHeader } = LAYOUT_HEIGHTS;

  if (messages.length === 0) {
    return { visibleMessages: [], prevMessage: null };
  }

  const endIndex = messages.length - scrollOffset;
  if (endIndex <= 0) {
    return { visibleMessages: [], prevMessage: null };
  }

  // Work backwards, accounting for headers based on original sequence
  let linesUsed = 0;
  let startIndex = endIndex;

  for (let i = endIndex - 1; i >= 0 && linesUsed < height; i--) {
    const prevMsg = messages[i - 1];
    const needsHeader = !prevMsg || prevMsg.username !== messages[i].username;
    const linesNeeded = needsHeader ? linesPerMessageWithHeader : linesPerMessage;

    if (linesUsed + linesNeeded <= height) {
      linesUsed += linesNeeded;
      startIndex = i;
    } else {
      break;
    }
  }

  return {
    visibleMessages: messages.slice(startIndex, endIndex),
    prevMessage: startIndex > 0 ? messages[startIndex - 1] : null,
  };
}
