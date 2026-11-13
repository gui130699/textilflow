export const runtime = "nodejs";

const allowed = [
  "companiesForUser",
  "saveCompany",
  "lookupCompanyCnpj",
  "registerInspector",
  "listInspectorRequests",
  "decideInspectorRequest",
  "listLotInspectors",
  "assignLotInspector",
  "saveCatalog",
  "saveProject",
  "recordEvent",
  "productionMovement",
  "reconcileProduction",
  "createInvite",
  "acceptInvite",
  "updateMember",
  "saveProfile",
  "dashboard",
  "reportPage",
] as const;
const statuses: Record<string, number> = {
  unavailable: 503,
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  "failed-precondition": 400,
  "resource-exhausted": 429,
  aborted: 409,
};

function failure(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  if (process.env.NEXT_PUBLIC_API_MODE !== "server")
    return failure(404, "Operação indisponível.");
  const { name } = await context.params;
  const operation = allowed.find((key) => key === name);
  if (!operation) return failure(404, "Operação indisponível.");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192)
    return failure(401, "Entre na sua conta para continuar.");
  const operations = await import("../../../../../functions/src/operations");
  let identity;
  try {
    identity = await operations.verifyOperationToken(token);
  } catch {
    return failure(401, "Sessão inválida. Entre novamente.");
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
    !request.body
  ) {
    return failure(400, "Envie a operação em JSON.");
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  let data: unknown;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128 * 1024) {
        await reader.cancel();
        return failure(413, "Operação muito grande.");
      }
      body += decoder.decode(value, { stream: true });
    }
    data = JSON.parse(body + decoder.decode());
  } catch {
    return failure(400, "Dados da operação inválidos.");
  } finally {
    reader.releaseLock();
  }
  try {
    const result = await operations[operation]({
      data,
      auth: { uid: identity.uid, token: identity },
    });
    return Response.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String(error.code)
        : "internal";
    const status = Object.hasOwn(statuses, code) ? statuses[code] : 500;
    return failure(
      status,
      (status < 500 || code === "unavailable") && error instanceof Error
        ? error.message
        : "Não foi possível concluir. Tente novamente.",
    );
  }
}
