export const LAYOUT_HEIGHTS = {
  header: 3,
  inputBox: 4,
  statusBar: 3,
  linesPerMessage: 1,
} as const;

export function calculateMiddleSectionHeight(
  terminalRows: number,
  topPadding: number
): number {
  const { header, inputBox, statusBar } = LAYOUT_HEIGHTS;
  return Math.max(5, terminalRows - topPadding - header - inputBox - statusBar);
}

export function calculateMaxVisibleMessages(middleSectionHeight: number): number {
  return Math.floor(middleSectionHeight / LAYOUT_HEIGHTS.linesPerMessage);
}
