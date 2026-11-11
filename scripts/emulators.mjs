import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
const env = { ...process.env };
const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
if (process.platform === "win32")
  for (const root of [
    "C:/Program Files/Eclipse Adoptium",
    "C:/Users/guilh/.codex/tools/java",
  ]) {
    if (existsSync(root)) {
      const jdk = readdirSync(root).find((d) =>
        existsSync(path.join(root, d, "bin/java.exe")),
      );
      if (jdk) {
        env.JAVA_HOME = path.join(root, jdk);
        env[pathKey] =
          path.join(env.JAVA_HOME, "bin") + path.delimiter + env[pathKey];
        break;
      }
    }
  }
const args = process.argv.slice(2);
const command = args.length ? args : ["emulators:start"];
const result = spawnSync(
  process.execPath,
  [
    "node_modules/firebase-tools/lib/bin/firebase.js",
    ...command,
    "--project",
    "demo-textilflow",
  ],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);
