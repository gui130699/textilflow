import { afterEach, expect, it, vi } from "vitest";
import { lookupCompany } from "../../functions/src/company-lookup";
import { validCnpj } from "../../functions/src/cnpj";

afterEach(() => vi.unstubAllGlobals());

it("valida CNPJ numérico e alfanumérico pelo dígito verificador", () => {
  expect(validCnpj("33000167000101")).toBe(true);
  expect(validCnpj("12ABC34501DE35")).toBe(true);
  expect(validCnpj("33000167000102")).toBe(false);
  expect(validCnpj("00000000000000")).toBe(false);
});

it("preenche o estabelecimento do CNPJ completo e seleciona a inscrição estadual ativa da UF", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        razao_social: "Empresa Exemplo",
        socios: [{ nome: "Dado fora do cadastro" }],
        estabelecimento: {
          cnpj: "33000167000101",
          nome_fantasia: "Exemplo",
          tipo_logradouro: "Rua",
          logradouro: "Rua das Flores",
          ddd1: "21",
          telefone1: "22223333",
          estado: { sigla: "RJ" },
          inscricoes_estaduais: [
            { inscricao_estadual: "123", ativo: true, estado: { sigla: "SP" } },
            {
              inscricao_estadual: "456",
              ativo: false,
              estado: { sigla: "RJ" },
            },
            { inscricao_estadual: "789", ativo: true, estado: { sigla: "RJ" } },
          ],
        },
      }),
    ),
  );
  const result = await lookupCompany("33.000.167/0001-01");
  expect(result.fields).toMatchObject({
    name: "Exemplo",
    address: "Rua das Flores",
    stateRegistration: "789",
    phone: "2122223333",
  });
  expect(result.fields).not.toHaveProperty("socios");
});

it("usa a fonte alternativa quando a primeira limita consultas", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 429 }))
    .mockResolvedValueOnce(
      Response.json({
        cnpj: "33000167000101",
        razao_social: "Empresa Exemplo",
        municipio: "Rio de Janeiro",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const result = await lookupCompany("33000167000101");
  expect(result.source).toBe("Minha Receita");
  expect(result.fields).toMatchObject({
    legalName: "Empresa Exemplo",
    city: "Rio de Janeiro",
  });
});
