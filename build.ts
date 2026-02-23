// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import solidPlugin from "@opentui/solid/bun-plugin"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const packageJson = JSON.parse(readFileSync(join(import.meta.dir, "package.json"), "utf-8"))
const version = packageJson.version

const allTargets = [
  { bunTarget: "bun-darwin-arm64", os: "darwin", arch: "arm64", dir: "darwin-arm64", corePkg: "@opentui/core-darwin-arm64" },
  { bunTarget: "bun-darwin-x64", os: "darwin", arch: "x64", dir: "darwin-x64", corePkg: "@opentui/core-darwin-x64" },
  { bunTarget: "bun-linux-x64", os: "linux", arch: "x64", dir: "linux-x64", corePkg: "@opentui/core-linux-x64" },
  { bunTarget: "bun-linux-arm64", os: "linux", arch: "arm64", dir: "linux-arm64", corePkg: "@opentui/core-linux-arm64" },
  { bunTarget: "bun-win32-x64", os: "win32", arch: "x64", dir: "win32-x64", corePkg: "@opentui/core-win32-x64" },
] as const

// Determine which targets to build
const buildAll = process.argv.includes("--all")
const targets = buildAll
  ? allTargets
  : allTargets.filter(({ os, arch }) => {
      return os === process.platform && arch === process.arch
    })

if (targets.length === 0) {
  console.error("No targets match the current platform. Use --all to build all targets.")
  process.exit(1)
}

// Ensure cross-platform @opentui/core packages are installed
if (buildAll) {
  const missing = allTargets.filter(
    ({ corePkg }) => !existsSync(join("node_modules", corePkg))
  )
  if (missing.length > 0) {
    const pkgs = missing.map(({ corePkg }) => corePkg).join(" ")
    console.log(`Installing cross-platform @opentui/core packages: ${pkgs}`)
    const proc = Bun.spawnSync(["npm", "install", "--force", "--no-save", ...missing.map(({ corePkg }) => corePkg)])
    if (proc.exitCode !== 0) {
      console.error("Failed to install cross-platform packages:")
      console.error(proc.stderr.toString())
      process.exit(1)
    }
  }
}

// Phase 1: Bundle with Solid plugin
console.log("Phase 1: Bundling with Solid plugin...")
const result = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  target: "bun",
  minify: true,
  plugins: [solidPlugin],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.__GROUPCHAT_VERSION__": JSON.stringify(version),
  },
})

if (!result.success) {
  console.error("Phase 1 failed:")
  for (const msg of result.logs) {
    console.error(msg)
  }
  process.exit(1)
}
console.log("Phase 1 complete!")

// Phase 2: Compile standalone binaries per platform
console.log(`Phase 2: Compiling platform binaries (${targets.length} target${targets.length > 1 ? "s" : ""})...`)
for (const { bunTarget, os, dir } of targets) {
  const binaryName = os === "win32" ? "groupchat.exe" : "groupchat"
  const outfile = join("npm", dir, "bin", binaryName)
  console.log(`  Compiling ${bunTarget} → ${outfile}`)

  const proc = Bun.spawnSync([
    "bun",
    "build",
    "--compile",
    "--no-config",
    "--no-compile-autoload-bunfig",
    `--target=${bunTarget}`,
    "./dist/index.js",
    "--outfile",
    outfile,
  ])

  if (proc.exitCode !== 0) {
    console.error(`  Failed to compile ${bunTarget}:`)
    console.error(proc.stderr.toString())
    process.exit(1)
  }
}

console.log("Build complete!")
