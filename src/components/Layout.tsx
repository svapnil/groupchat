// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { JSX, ParentComponent } from "solid-js"
import { LAYOUT_HEIGHTS } from "../lib/layout"

export type LayoutProps = {
  width: number
  height: number
  topPadding?: number
}

export type SlotProps = {
  children?: JSX.Element
}

type LayoutComponent = ParentComponent<LayoutProps> & {
  Header: ParentComponent<SlotProps>
  Content: ParentComponent<SlotProps>
  Footer: ParentComponent<SlotProps>
}

const LayoutHeader: ParentComponent<SlotProps> = (props) => {
  return <>{props.children}</>
}

const LayoutContent: ParentComponent<SlotProps> = (props) => {
  return <>{props.children}</>
}

const LayoutFooter: ParentComponent<SlotProps> = (props) => {
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      height={LAYOUT_HEIGHTS.footer}
      paddingBottom={LAYOUT_HEIGHTS.footer - LAYOUT_HEIGHTS.statusBar}
    >
      {props.children}
    </box>
  )
}

const LayoutBase: ParentComponent<LayoutProps> = (props) => {
  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      overflow="hidden"
      paddingTop={props.topPadding ?? 0}
    >
      {props.children}
    </box>
  )
}

const Layout = LayoutBase as LayoutComponent
Layout.Header = LayoutHeader
Layout.Content = LayoutContent
Layout.Footer = LayoutFooter

export { Layout }
