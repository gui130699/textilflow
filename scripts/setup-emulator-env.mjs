import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env.local") && !process.argv.includes("--replace"))
  throw Error(".env.local já existe. Revise antes de usar --replace.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-textilflow.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-textilflow
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-textilflow.appspot.com
NEXT_PUBLIC_FIREBASE_APP_ID=demo-app
NEXT_PUBLIC_USE_EMULATORS=true
`,
);
console.log("Ambiente configurado exclusivamente para demo-textilflow.");
