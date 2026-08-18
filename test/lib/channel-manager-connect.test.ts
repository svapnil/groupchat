// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// The socket connect params are a wire contract with the backend
// (Chat.UserSocket.connect/3): `client`/`remote` gate agent dispatch, and
// `working_dir` is the label web shows for where an @mention will run.
import { describe, expect, mock, test } from "bun:test"
import { homedir } from "os"

let capturedParams: Record<string, string> | null = null

mock.module("phoenix", () => ({
  Socket: class {
    constructor(_url: string, opts: { params: Record<string, string> }) {
      capturedParams = opts.params
    }
    onOpen(cb: () => void) {
      // Resolve connect() synchronously — nothing here talks to a server.
      cb()
    }
    onError() {}
    onClose() {}
    connect() {}
  },
}))

describe("ChannelManager connect params", () => {
  test("identifies as a remote TUI and reports its working directory", async () => {
    const { ChannelManager } = await import("../../src/lib/channel-manager")

    await new ChannelManager("ws://localhost:4000/socket", "test-token").connect()

    expect(capturedParams).not.toBeNull()
    expect(capturedParams!.client).toBe("tui")
    expect(capturedParams!.remote).toBe("true")

    // Home-shortened, so the OS account name never goes over the wire.
    expect(capturedParams!.working_dir).toBe(process.cwd().replace(homedir(), "~"))
    expect(capturedParams!.working_dir.startsWith(homedir())).toBe(false)
  })
})
