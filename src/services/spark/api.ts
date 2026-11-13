import { z } from "zod";
import { updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  catalogKinds,
  catalogSchema,
  id,
  text,
} from "../../../functions/src/domain";
import { lookupCompany } from "../../../functions/src/company-lookup";
import { normalizeDocument, validCnpj } from "../../../functions/src/cnpj";
import { dashboard, reconcileProduction, reportPage } from "./queries";
import { recordEvent, saveProject } from "./projects";
import { productionMovement } from "./movements";

const companyIdInput = z.object({ companyId: id });
const company = (id: string) => doc(db, "companies", id);
const member = (companyId: string, uid: string) =>
  doc(company(companyId), "members", uid);
const link = (companyId: string, uid: string) =>
  doc(db, "users", uid, "companies", companyId);
const inspectorRequest = (companyId: string, uid: string) =>
  doc(company(companyId), "inspectorRequests", uid);
const profileName = z.string().trim().min(2).max(120);
const catalogInput = z.object({ id, data: catalogSchema });
const bytesHex = (v: ArrayBuffer | Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(v))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const hash = async (value: string) =>
  bytesHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );

export async function callFirestore(name: string, raw: unknown) {
  const user = auth.currentUser;
  if (!user) throw Error("Entre na sua conta para continuar.");
  const uid = user.uid;
  const profile = doc(db, "users", uid);
  const stamp = { updatedAt: serverTimestamp(), updatedBy: uid };
  const creation = { createdAt: serverTimestamp(), createdBy: uid };
  switch (name) {
    case "lookupCompanyCnpj": {
      const { taxId } = z.object({ taxId: z.string().max(32) }).parse(raw);
      return lookupCompany(taxId);
    }
    case "companiesForUser": {
      const [links, profileDoc, token] = await Promise.all([
        getDocs(collection(profile, "companies")),
        getDoc(profile),
        user.getIdTokenResult(),
      ]);
      const companies = await Promise.all(
        links.docs.map(async ({ id }) => {
          const m = await getDoc(member(id, uid));
          if (!m.get("active")) return null;
          try {
            const c = await getDoc(company(id));
            return c.exists() ? { ...c.data(), id, role: m.get("role") } : null;
          } catch (error) {
            if ((error as { code?: string }).code === "permission-denied")
              return null;
            throw error;
          }
        }),
      );
      return {
        companies: companies.filter(Boolean),
        canCreate:
          token.claims.email_verified === true &&
          (profileDoc.get("inspectorRegistered") === true ||
            token.claims.inspector === true),
      };
    }
    case "registerInspector": {
      const { name } = z.object({ name: profileName }).parse(raw);
      await setDoc(
        profile,
        { name, inspectorRegistered: true },
        { merge: true },
      );
      return { ok: true };
    }
    case "saveProfile": {
      const { name, phone } = z
        .object({ name: profileName, phone: text.default("") })
        .parse(raw);
      await setDoc(
        profile,
        { name, phone, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await updateProfile(user, { displayName: name });
      return { ok: true };
    }
    case "saveCompany": {
      const input = catalogInput.parse(raw);
      const data = {
        ...input.data,
        taxId: normalizeDocument(input.data.taxId),
      };
      if (!validCnpj(data.taxId)) throw Error("Confira o CNPJ informado.");
      const ref = company(input.id);
      const registry = doc(db, "companyCnpjs", data.taxId);
      const display = (await getDoc(profile)).get("name") || "Inspetor";
      return runTransaction(db, async (tx) => {
        const reg = await tx.get(registry);
        const target = reg.get("companyId");
        if (target && target !== input.id) {
          const [current, pending] = await Promise.all([
            tx.get(member(target, uid)),
            tx.get(inspectorRequest(target, uid)),
          ]);
          if (current.get("active") && current.get("role") === "inspector")
            return { status: "already-member" };
          if (pending.get("status") !== "pending")
            tx.set(pending.ref, {
              status: "pending",
              email: user.email,
              name: display,
              createdAt: serverTimestamp(),
            });
          return { status: "pending" };
        }
        const fields = {
          ...data,
          companyId: input.id,
          searchName: data.name.toLocaleLowerCase("pt-BR"),
          ...stamp,
        };
        if (target) tx.update(ref, fields);
        else {
          tx.set(ref, { ...fields, ...creation });
          tx.set(registry, { companyId: input.id });
          tx.set(member(input.id, uid), {
            role: "inspector",
            name: display,
            active: true,
            createdAt: serverTimestamp(),
          });
          tx.set(link(input.id, uid), { companyId: input.id });
        }
        return { id: input.id, status: "saved" };
      });
    }
    case "listInspectorRequests": {
      const { companyId } = companyIdInput.parse(raw);
      const owner = await getDoc(company(companyId));
      if (owner.get("createdBy") !== uid) return [];
      const items = await getDocs(
        query(
          collection(company(companyId), "inspectorRequests"),
          where("status", "==", "pending"),
          limit(100),
        ),
      );
      return items.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    case "decideInspectorRequest": {
      const { companyId, requesterId, approve } = companyIdInput
        .extend({
          requesterId: id,
          approve: z.boolean(),
        })
        .parse(raw);
      await runTransaction(db, async (tx) => {
        const pending = await tx.get(inspectorRequest(companyId, requesterId));
        if (pending.get("status") !== "pending")
          throw Error("Este pedido já foi analisado.");
        tx.update(pending.ref, {
          status: approve ? "approved" : "rejected",
          reviewedAt: serverTimestamp(),
          reviewedBy: uid,
        });
        if (approve) {
          tx.set(member(companyId, requesterId), {
            role: "inspector",
            name: pending.get("name"),
            active: true,
            createdAt: serverTimestamp(),
          });
          tx.set(link(companyId, requesterId), { companyId });
        }
      });
      return { ok: true };
    }
    case "listLotInspectors": {
      const { companyId } = companyIdInput.parse(raw);
      const items = await getDocs(
        query(
          collection(company(companyId), "members"),
          where("role", "==", "inspector"),
          where("active", "==", true),
        ),
      );
      return items.docs.map((d) => ({ id: d.id, name: d.get("name") || d.id }));
    }
    case "saveCatalog": {
      const { companyId, kind, id, data } = catalogInput
        .extend({
          companyId: companyIdInput.shape.companyId,
          kind: z.enum(catalogKinds),
        })
        .parse(raw);
      const ref = doc(company(companyId), kind, id);
      await runTransaction(db, async (tx) => {
        const before = await tx.get(ref);
        tx.set(
          ref,
          {
            ...data,
            companyId,
            searchName: data.name.toLocaleLowerCase("pt-BR"),
            ...stamp,
            ...(!before.exists() ? creation : {}),
          },
          { merge: true },
        );
      });
      return { id };
    }
    case "createInvite": {
      const input = companyIdInput
        .extend({ email: z.email(), role: z.literal("owner") })
        .parse(raw);
      const token = bytesHex(crypto.getRandomValues(new Uint8Array(32)));
      await setDoc(doc(db, "sparkInvites", await hash(token)), {
        ...input,
        email: input.email.toLowerCase(),
        ...creation,
        used: false,
      });
      return { token, expiresInHours: 48 };
    }
    case "acceptInvite": {
      const { token } = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(raw);
      const inviteId = await hash(token);
      const invite = doc(db, "sparkInvites", inviteId);
      await runTransaction(db, async (tx) => {
        const i = await tx.get(invite);
        if (!i.exists() || i.get("used"))
          throw Error("Convite inválido ou já utilizado.");
        const c = i.get("companyId");
        tx.update(invite, {
          used: true,
          usedAt: serverTimestamp(),
          usedBy: uid,
        });
        tx.set(member(c, uid), {
          role: "owner",
          active: true,
          name: user.displayName || "Proprietário",
          createdAt: serverTimestamp(),
          inviteId,
        });
        tx.set(link(c, uid), { companyId: c });
      });
      return { ok: true };
    }
    case "updateMember": {
      const { companyId, memberId, active } = companyIdInput
        .extend({
          memberId: id,
          active: z.boolean(),
        })
        .parse(raw);
      await updateDoc(member(companyId, memberId), {
        active,
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    }
    case "assignLotInspector": {
      const { companyId, projectId, lotId, inspectorUid } = companyIdInput
        .extend({
          projectId: id,
          lotId: id,
          inspectorUid: id,
        })
        .parse(raw);
      const project = doc(company(companyId), "projects", projectId);
      const target = await getDoc(member(companyId, inspectorUid));
      const lot = doc(project, "productionBalances", lotId);
      const event = doc(collection(project, "lotAssignments"));
      const batch = writeBatch(db);
      batch.update(lot, {
        inspectorUid,
        inspectorName: target.get("name") || inspectorUid,
        assignmentId: event.id,
      });
      batch.set(event, { lotId, inspectorUid, ...creation });
      await batch.commit();
      return { ok: true };
    }
    case "saveProject":
      return saveProject(uid, raw);
    case "recordEvent":
      return recordEvent(uid, raw, hash);
    case "productionMovement":
      return productionMovement(uid, raw, hash);
    case "dashboard":
      return dashboard(raw);
    case "reportPage":
      return reportPage(raw);
    case "reconcileProduction":
      return reconcileProduction(raw);
    default:
      throw Error("Esta operação ainda não está disponível na versão Spark.");
  }
}
