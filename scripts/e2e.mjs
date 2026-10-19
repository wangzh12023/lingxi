// pnpm eval:e2e [--llm|--mock|--freeze] — runs eval/e2e.mts with the react-server condition, so the
// server modules (model client, hooks) load outside Next.
import { spawnSync } from "node:child_process"
const r = spawnSync("npx", ["tsx", "eval/e2e.mts", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env: { ...process.env, NODE_OPTIONS: "--conditions=react-server --no-warnings" } })
process.exit(r.status ?? 1)
