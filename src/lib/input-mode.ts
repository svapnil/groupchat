// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar

export type InputMode = {
  id: string
  label: string
  accentColor: string
  placeholder?: string
  helperText?: string
  pendingAction?: boolean
  pendingActionAllowsTextInput?: boolean
  pendingActionPlaceholder?: string
  pendingActionHelperText?: string
}
