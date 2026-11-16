import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { demoEmails, seedManufacturing } from "./manufacturing-demo";

const project = "textilflow-hml-gui130699";
if (
  process.argv[2] !== project ||
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw Error(
    "Informe explicitamente o projeto isolado textilflow-hml-gui130699, fora dos emuladores.",
  );

const require = createRequire(join(process.cwd(), "package.json"));
const {
  getGlobalDefaultAccount,
  getAccessToken,
} = require("firebase-tools/lib/auth");
const { CLOUD_PLATFORM } = require("firebase-tools/lib/scopes");
const { clientId, clientSecret } = require("firebase-tools/lib/api");
const credential = {
  async getAccessToken() {
    const result = await getAccessToken(
      getGlobalDefaultAccount()?.tokens?.refresh_token,
      [CLOUD_PLATFORM],
    );
    return { access_token: result.access_token, expires_in: 600 };
  },
};
async function main() {
  const billing = await fetch(
    `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
    {
      headers: {
        Authorization:
          "Bearer " + (await credential.getAccessToken()).access_token,
      },
    },
  );
  if (!billing.ok || (await billing.json()).billingEnabled !== false)
    throw Error("Não foi possível confirmar o Spark.");
  const directory = join(homedir(), ".codex", "textilflow-homologacao");
  const file = join(directory, "credenciais.json");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const username = process.env.USERNAME;
    const domain = process.env.USERDOMAIN;
    if (!username || !domain)
      throw Error("Não foi possível identificar o usuário do Windows.");
    execFileSync("icacls.exe", [
      directory,
      "/grant:r",
      domain + "\\" + username + ":(OI)(CI)(F)",
      "/inheritance:r",
    ]);
  }
  if (!existsSync(file))
    writeFileSync(
      file,
      JSON.stringify({
        ...demoEmails,
        password: randomBytes(32).toString("base64url"),
      }) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  const { password } = JSON.parse(readFileSync(file, "utf8"));
  const adc = join(directory, `adc-${randomBytes(12).toString("hex")}.json`);
  const refreshToken = getGlobalDefaultAccount()?.tokens?.refresh_token;
  if (!refreshToken)
    throw Error("Entre no Firebase CLI antes de provisionar a demonstração.");
  writeFileSync(
    adc,
    JSON.stringify({
      type: "authorized_user",
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
    }),
    { flag: "wx", mode: 0o600 },
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adc;
  try {
    const app = initializeApp({
      projectId: project,
      credential: applicationDefault(),
    });
    await seedManufacturing(getFirestore(app), getAuth(app), password);
  } finally {
    unlinkSync(adc);
  }
  console.log(
    "Demonstração pronta. Credenciais disponíveis no arquivo local " + file,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
