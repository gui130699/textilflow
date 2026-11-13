import { z } from "zod";
import { normalizeDocument, validCnpj } from "./cnpj";

const optionalText = z.string().nullish();
const cnpjWs = z.object({
  razao_social: z.string().min(2),
  estabelecimento: z.object({
    cnpj: z.string(),
    nome_fantasia: optionalText,
    tipo_logradouro: optionalText,
    logradouro: optionalText,
    numero: optionalText,
    complemento: optionalText,
    bairro: optionalText,
    cep: optionalText,
    ddd1: optionalText,
    telefone1: optionalText,
    email: optionalText,
    cidade: z.object({ nome: optionalText }).nullish(),
    estado: z.object({ sigla: optionalText }).nullish(),
    inscricoes_estaduais: z
      .array(
        z.object({
          inscricao_estadual: optionalText,
          ativo: z.boolean(),
          estado: z.object({ sigla: optionalText }).nullish(),
        }),
      )
      .nullish(),
  }),
});
const minhaReceita = z.object({
  cnpj: z.string(),
  razao_social: z.string().min(2),
  nome_fantasia: optionalText,
  descricao_tipo_de_logradouro: optionalText,
  logradouro: optionalText,
  numero: optionalText,
  complemento: optionalText,
  bairro: optionalText,
  municipio: optionalText,
  uf: optionalText,
  cep: optionalText,
  ddd_telefone_1: optionalText,
  email: optionalText,
});

function address(type?: string | null, street?: string | null) {
  const prefix = type?.trim();
  const name = street?.trim();
  if (prefix && name?.toUpperCase().startsWith(prefix.toUpperCase() + " "))
    return name;
  return [prefix, name].filter(Boolean).join(" ");
}

function businessFields(
  legalName: string,
  tradeName?: string | null,
  email?: string | null,
) {
  return {
    name: (tradeName?.trim() || legalName.trim()).slice(0, 160),
    legalName: legalName.trim(),
    tradeName,
    email: z.email().safeParse(email?.trim()).success
      ? email?.trim()
      : undefined,
    personType: "Jurídica",
  };
}

async function fetchRegistry(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4500),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    return {
      missing: response.status === 404,
      data: response.ok ? ((await response.json()) as unknown) : null,
    };
  } catch {
    return { missing: false, data: null };
  }
}

export class CompanyLookupError extends Error {
  constructor(
    readonly code: "invalid-argument" | "not-found" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
export async function lookupCompany(input: string) {
  const taxId = normalizeDocument(input);
  if (!validCnpj(taxId))
    throw new CompanyLookupError(
      "invalid-argument",
      "Confira o CNPJ informado.",
    );
  const primary = await fetchRegistry(`https://publica.cnpj.ws/cnpj/${taxId}`);
  const result = cnpjWs.safeParse(primary.data);
  if (
    result.success &&
    normalizeDocument(result.data.estabelecimento.cnpj) === taxId
  ) {
    const { estabelecimento: e, razao_social } = result.data;
    return {
      source: "CNPJ.ws",
      fields: {
        ...businessFields(razao_social, e.nome_fantasia, e.email),
        taxId,
        address: address(e.tipo_logradouro, e.logradouro),
        number: e.numero,
        complement: e.complemento,
        neighborhood: e.bairro,
        city: e.cidade?.nome,
        state: e.estado?.sigla,
        zip: e.cep,
        phone: e.telefone1 ? [e.ddd1, e.telefone1].join("") : "",
        stateRegistration: e.inscricoes_estaduais?.find(
          (ie) => ie.ativo && ie.estado?.sigla === e.estado?.sigla,
        )?.inscricao_estadual,
      },
    };
  }
  const fallback = await fetchRegistry(`https://minhareceita.org/${taxId}`);
  const other = minhaReceita.safeParse(fallback.data);
  if (other.success && normalizeDocument(other.data.cnpj) === taxId) {
    const e = other.data;
    return {
      source: "Minha Receita",
      fields: {
        ...businessFields(e.razao_social, e.nome_fantasia, e.email),
        taxId,
        address: address(e.descricao_tipo_de_logradouro, e.logradouro),
        number: e.numero,
        complement: e.complemento,
        neighborhood: e.bairro,
        city: e.municipio,
        state: e.uf,
        zip: e.cep,
        phone: e.ddd_telefone_1,
      },
    };
  }
  if (primary.missing || fallback.missing)
    throw new CompanyLookupError(
      "not-found",
      "CNPJ não encontrado na consulta. Você pode preencher o cadastro manualmente.",
    );
  throw new CompanyLookupError(
    "unavailable",
    "A consulta está indisponível. Tente novamente ou preencha o cadastro manualmente.",
  );
}
