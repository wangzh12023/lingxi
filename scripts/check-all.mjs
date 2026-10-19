// Runs every check in tests/. Usage: node scripts/check-all.mjs   (or: pnpm check)
// Server modules carry `import "server-only"`; the react-server condition lets them load outside Next.
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"

const tests = readdirSync("tests").filter((f) => f.endsWith(".check.mts")).sort()
let failed = 0
for (const t of tests) {
  const r = spawnSync("npx", ["tsx", `tests/${t}`], { encoding: "utf8", shell: true, env: { ...process.env, NODE_OPTIONS: "--conditions=react-server --no-warnings", LINGXI_MODE: "offline" } })
  const last = (r.stdout ?? "").trim().split("\n").at(-1)
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? "pass" : "FAIL"}  ${t.padEnd(24)} ${last ?? ""}`)
  if (!ok) console.log((r.stdout ?? "").split("\n").filter((l) => l.startsWith("FAIL")).join("\n") || r.stderr?.slice(0, 800))
}
console.log(failed ? `\n${failed} of ${tests.length} checks failed` : `\nall ${tests.length} checks pass`)
process.exit(failed ? 1 : 0)
