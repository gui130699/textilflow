import { onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as operations from "./operations";

setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 3,
  memory: "256MiB",
  timeoutSeconds: 60,
});

export const companiesForUser = onCall(operations.companiesForUser);
export const saveCompany = onCall(operations.saveCompany);
export const saveCatalog = onCall(operations.saveCatalog);
export const saveProject = onCall(operations.saveProject);
export const recordEvent = onCall(operations.recordEvent);
export const productionMovement = onCall(operations.productionMovement);
export const reconcileProduction = onCall(operations.reconcileProduction);
export const createInvite = onCall(operations.createInvite);
export const acceptInvite = onCall(operations.acceptInvite);
export const updateMember = onCall(operations.updateMember);
export const saveProfile = onCall(operations.saveProfile);
export const saveAttachment = onCall(operations.saveAttachment);
export const dashboard = onCall(operations.dashboard);
export const reportPage = onCall(operations.reportPage);
export const saveCatalogImage = onCall(operations.saveCatalogImage);
