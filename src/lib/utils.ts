import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ZodError } from "zod";
import { format, parseISO } from "date-fns";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const number = (v: unknown) =>
  new Intl.NumberFormat("pt-BR").format(Number(v) || 0);
export function formatDate(v: unknown): string {
  if (!v) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
    return format(parseISO(v), "dd/MM/yyyy");
  const candidate = v as {
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  const d =
    candidate.toDate?.() ??
    new Date((candidate.seconds ?? candidate._seconds ?? 0) * 1000);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function errorMessage(e: unknown) {
  if (e instanceof ZodError)
    return e.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  const message =
    e instanceof Error ? e.message : "Não foi possível concluir a operação.";
  if (
    message.includes("auth/invalid-credential") ||
    message.includes("auth/wrong-password") ||
    message.includes("auth/user-not-found")
  )
    return "E-mail ou senha incorretos.";
  if (message.includes("auth/too-many-requests"))
    return "Muitas tentativas. Aguarde alguns minutos.";
  if (message.includes("permission-denied"))
    return "Seu acesso não permite esta operação.";
  return message.replace(/^Firebase:\s*/, "");
}
