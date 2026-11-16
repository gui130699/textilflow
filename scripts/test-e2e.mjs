import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function run(script, args, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const playwright = "node_modules/@playwright/test/cli.js";
run(playwright, ["test", ...args]);

// Quality calls npm run test:e2e with the demo emulators already running.
// Exercise the static Hosting build as well as the legacy development server.
if (
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GCLOUD_PROJECT === "demo-textilflow" &&
  process.env.NEXT_PUBLIC_API_MODE !== "firestore" &&
  args.length === 0
) {
  run("scripts/build-spark.mjs", ["--emulator"]);
  run(playwright, ["test"], {
    ...process.env,
    NEXT_PUBLIC_API_MODE: "firestore",
  });
}
