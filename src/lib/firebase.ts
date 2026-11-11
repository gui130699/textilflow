import { getApps, initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const configured = Boolean(
  config.apiKey && config.projectId && config.appId,
);
const app =
  getApps()[0] ??
  initializeApp(
    configured
      ? config
      : { apiKey: "demo-key", projectId: "demo-textilflow", appId: "demo-app" },
  );
export const auth = getAuth(app),
  db = getFirestore(app),
  functions = getFunctions(app, "southamerica-east1"),
  storage = getStorage(app);
const globalState = globalThis as typeof globalThis & {
  textilflowEmulators?: boolean;
};
if (
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true" &&
  !globalState.textilflowEmulators
) {
  if (config.projectId !== "demo-textilflow")
    throw Error("Emuladores exigem o projeto demo-textilflow.");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  globalState.textilflowEmulators = true;
}
