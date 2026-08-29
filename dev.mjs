#!/usr/bin/env node
/**
 * One-command dev environment: API server (embedded PGlite database, no
 * external services) + web app. `pnpm install && pnpm dev` on a fresh clone
 * is all it takes; open http://localhost:5173/shop
 */

import { spawn } from "node:child_process";

const API_PORT = process.env.API_PORT ?? "8080";
const WEB_PORT = process.env.PORT ?? "5173";

const procs = [
  {
    name: "api",
    color: "\x1b[36m",
    cmd: ["pnpm", "--filter", "@workspace/api-server", "run", "dev"],
    env: { PORT: API_PORT },
  },
  {
    name: "web",
    color: "\x1b[35m",
    cmd: ["pnpm", "--filter", "@workspace/rv-marketplace", "run", "dev"],
    env: { PORT: WEB_PORT, BASE_PATH: process.env.BASE_PATH ?? "/" },
  },
];

const children = [];
for (const p of procs) {
  const child = spawn(p.cmd[0], p.cmd.slice(1), {
    env: { ...process.env, ...p.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream) =>
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) process.stdout.write(prefix + line + "\n");
      }
    });
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited (${code})`);
    for (const c of children) c.kill("SIGTERM");
    process.exit(code ?? 0);
  });
  children.push(child);
}

console.log(`\n  MatchRV dev environment starting…`);
console.log(`  → web:  http://localhost:${WEB_PORT}/shop  (agent-native shopping)`);
console.log(`  → api:  http://localhost:${API_PORT}/api/agent/meta\n`);

process.on("SIGINT", () => {
  for (const c of children) c.kill("SIGINT");
  process.exit(0);
});
