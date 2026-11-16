import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const emulator = process.argv.includes("--emulator");
const homologacao = process.argv.includes("--homologacao");
if (emulator && homologacao) throw Error("Selecione apenas um ambiente.");
const config = readFileSync("apphosting.yaml", "utf8");
const sdk = Object.fromEntries(
  [
    ...config.matchAll(
      /- variable: (NEXT_PUBLIC_FIREBASE_\w+)\s+value: ([^\s]+)/g,
    ),
  ].map(([, key, value]) => [key, value]),
);
if (
  Object.keys(sdk).length !== 5 ||
  sdk.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "textilflow-gui130699"
) {
  throw new Error("Configuração pública do Firebase inválida.");
}
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...sdk,
      ...(homologacao
        ? {
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "textilflow-hml-gui130699",
            NEXT_PUBLIC_FIREBASE_API_KEY:
              "AIzaSyCVMvVvyQVsRsxx6ol5UZ_LR67Fx5HPMK0",
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
              "textilflow-hml-gui130699.firebaseapp.com",
            NEXT_PUBLIC_FIREBASE_APP_ID:
              "1:367618262810:web:cbe486f05980adbd068ea3",
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
              "textilflow-hml-gui130699.firebasestorage.app",
          }
        : {}),
      ...(emulator
        ? {
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-textilflow",
            NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-textilflow.firebaseapp.com",
            NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-textilflow.appspot.com",
          }
        : {}),
      NEXT_PUBLIC_USE_EMULATORS: emulator ? "true" : "false",
      NEXT_PUBLIC_API_MODE: "firestore",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
