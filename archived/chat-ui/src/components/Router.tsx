// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { ParentComponent } from "solid-js"
import { NavigationProvider, useNavigation, type Route } from "../stores/navigation-store"

type RouterProps = {
  initialRoute?: Route
}

export const Router: ParentComponent<RouterProps> = (props) => {
  return (
    <NavigationProvider initialRoute={props.initialRoute}>
      {props.children}
    </NavigationProvider>
  )
}

export { useNavigation }
