import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
const email = z.email().parse(process.argv[2]);
const projectId = z
  .string()
  .regex(/^[a-z][a-z0-9-]+$/)
  .parse(process.argv[3]);
if (process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw Error("Remova a variável de emulador antes de provisionar produção.");
initializeApp({ projectId, credential: applicationDefault() });
const auth = getAuth();
async function run() {
  const user = await auth.getUserByEmail(email).catch(async (e) => {
    if (e.code !== "auth/user-not-found") throw e;
    return auth.createUser({
      email,
      displayName: "Inspetor",
      emailVerified: false,
    });
  });
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    inspector: true,
  });
  console.log(
    "Inspetor provisionado. Use a recuperação de senha na tela de login para definir seu acesso. Nenhuma senha foi gerada ou impressa.",
  );
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
