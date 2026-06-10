// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// Resolves which organization the TUI session is scoped to.
//
// On auth: fetch memberships. One org (or none) resolves silently; with 2+
// orgs a previously stored choice is reused if still valid, otherwise the
// app shows OrgSelectScreen until the user picks. The choice persists across
// sessions (lib/org-storage.ts) and is cleared on explicit logout, so the
// next login prompts again. The resolved slug is pushed into the chat-client
// module scope so every API call carries it without per-call plumbing.
import { createContext, createEffect, createSignal, useContext, type ParentComponent } from "solid-js"
import { fetchOrganizations, setOrgScope, type Organization } from "../lib/chat-client"
import { getStoredOrg, storeOrg } from "../lib/org-storage"
import { getConfig } from "../lib/config"
import { useAuth } from "./auth-store"

type OrgContextValue = {
  orgs: () => Organization[]
  /** Slug the session is scoped to; null = unscoped (backend default). */
  currentOrg: () => string | null
  /** True when the user must pick an org before the workspace loads. */
  needsSelection: () => boolean
  /** True once the org scope is settled (lists may load). */
  resolved: () => boolean
  selectOrg: (slug: string) => void
}

const OrgContext = createContext<OrgContextValue>()

export const OrgProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const [orgs, setOrgs] = createSignal<Organization[]>([])
  const [currentOrg, setCurrentOrg] = createSignal<string | null>(null)
  const [needsSelection, setNeedsSelection] = createSignal(false)
  const [resolved, setResolved] = createSignal(false)

  const settle = (slug: string | null) => {
    setOrgScope(slug)
    setCurrentOrg(slug)
    setNeedsSelection(false)
    setResolved(true)
  }

  createEffect(() => {
    const token = auth.token()
    if (!token) {
      // In-memory reset only — the persisted choice is cleared by an explicit
      // logout (auth-store), not by transient unauthenticated states at startup.
      setOrgScope(null)
      setOrgs([])
      setCurrentOrg(null)
      setNeedsSelection(false)
      setResolved(false)
      return
    }

    void (async () => {
      let memberships: Organization[]
      try {
        memberships = await fetchOrganizations(getConfig().wsUrl, token)
      } catch {
        // Orgs endpoint unavailable (old backend, network blip): run unscoped
        // so the TUI keeps working against the backend default.
        settle(null)
        return
      }

      setOrgs(memberships)

      if (memberships.length <= 1) {
        settle(memberships[0]?.slug ?? null)
        return
      }

      const stored = getStoredOrg()
      if (stored && memberships.some((org) => org.slug === stored)) {
        settle(stored)
        return
      }

      setNeedsSelection(true)
    })()
  })

  const selectOrg = (slug: string) => {
    if (!orgs().some((org) => org.slug === slug)) return
    storeOrg(slug)
    settle(slug)
  }

  return (
    <OrgContext.Provider
      value={{ orgs, currentOrg, needsSelection, resolved, selectOrg }}
    >
      {props.children}
    </OrgContext.Provider>
  )
}

export function useOrgStore(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error("useOrgStore must be used within OrgProvider")
  }
  return ctx
}
