import React, { ReactNode, ReactElement, Children, isValidElement } from "react";
import { Box } from "ink";

interface LayoutProps {
  width: number;
  height: number;
  topPadding?: number;
  children: ReactNode;
}

interface SlotProps {
  children: ReactNode;
}

// Slot component types
function LayoutHeader({ children }: SlotProps): ReactElement {
  return <>{children}</>;
}

function LayoutContent({ children }: SlotProps): ReactElement {
  return <>{children}</>;
}

function LayoutFooter({ children }: SlotProps): ReactElement {
  return <>{children}</>;
}

// Helper to extract slot content by component type
function extractSlot(
  children: ReactNode,
  SlotComponent: typeof LayoutHeader | typeof LayoutContent | typeof LayoutFooter
): ReactNode {
  let slotContent: ReactNode = null;

  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === SlotComponent) {
      slotContent = child.props.children;
    }
  });

  return slotContent;
}

// Main Layout component
export function Layout({ width, height, topPadding = 0, children }: LayoutProps) {
  const header = extractSlot(children, LayoutHeader);
  const content = extractSlot(children, LayoutContent);
  const footer = extractSlot(children, LayoutFooter);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      paddingTop={topPadding}
    >
      {header}
      {content}
      {footer}
    </Box>
  );
}

// Attach slot components to Layout
Layout.Header = LayoutHeader;
Layout.Content = LayoutContent;
Layout.Footer = LayoutFooter;
