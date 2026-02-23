// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { PresenceDiff, PresenceState } from "./types.js";

type PresenceMeta = PresenceState[string]["metas"][number];

function upsertMetas(
  existing: PresenceMeta[],
  incoming: PresenceMeta[]
): PresenceMeta[] {
  if (incoming.length === 0) return existing;

  const merged = existing.slice();
  const indexByRef = new Map<string, number>();

  existing.forEach((meta, index) => {
    indexByRef.set(meta.phx_ref, index);
  });

  incoming.forEach((meta) => {
    const index = indexByRef.get(meta.phx_ref);
    if (index === undefined) {
      indexByRef.set(meta.phx_ref, merged.length);
      merged.push(meta);
    } else {
      merged[index] = meta;
    }
  });

  return merged;
}

function removeMetas(
  existing: PresenceMeta[],
  leaving: PresenceMeta[]
): PresenceMeta[] {
  if (leaving.length === 0) return existing;

  const refsToRemove = new Set(leaving.map((meta) => meta.phx_ref));
  return existing.filter((meta) => !refsToRemove.has(meta.phx_ref));
}

export function applyPresenceDiff(
  prev: PresenceState,
  diff: PresenceDiff
): PresenceState {
  const next: PresenceState = { ...prev };

  Object.entries(diff.leaves).forEach(([username, data]) => {
    const existing = next[username]?.metas;
    if (!existing || existing.length === 0) return;

    const remaining = removeMetas(existing, data.metas);
    if (remaining.length === 0) {
      delete next[username];
    } else {
      next[username] = { metas: remaining };
    }
  });

  Object.entries(diff.joins).forEach(([username, data]) => {
    const existing = next[username]?.metas ?? [];
    const merged = upsertMetas(existing, data.metas);
    if (merged.length > 0) {
      next[username] = { metas: merged };
    }
  });

  return next;
}
