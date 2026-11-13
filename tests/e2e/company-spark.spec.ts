import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const credentials = JSON.parse(
  readFileSync(".emulator-credentials.json", "utf8"),
);
const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:3000" };
const cnpjWs = "https://publica.cnpj.ws/cnpj/";
const minhaReceita = "https://minhareceita.org/";
const numeric = "33000167000101";
const alphanumeric = "21ABC34501DE26";
const duplicate = "60701190000104";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Qual empresa vamos acompanhar?" }),
  ).toBeVisible();
}

async function openCompany(page: Page) {
  await page.getByRole("button", { name: "Cadastrar empresa" }).click();
  const form = page.getByRole("dialog", { name: "Cadastrar nova empresa" });
  await expect(form).toBeVisible();
  return form;
}

test.describe("Cadastro de empresa no Spark", () => {
  test.skip(
    process.env.NEXT_PUBLIC_API_MODE !== "firestore",
    "Exclusivo do Spark",
  );

  test("inspetor sem vínculo consulta, troca o CNPJ e salva manualmente", async ({
    page,
  }) => {
    await signIn(page, credentials.companyInspectorEmail);
    await expect(page.locator(".company-card")).toHaveCount(1);
    const form = await openCompany(page);
    const cnpj = form.getByLabel("CNPJ", { exact: true });
    const lookup = form.getByRole("button", { name: "Consultar CNPJ" });
    let calls = 0;
    let respond = () => {};
    const pending = new Promise<void>((resolve) => {
      respond = resolve;
    });
    await page.route(cnpjWs + "*", async (route) => {
      calls++;
      if (route.request().url() === cnpjWs + numeric) {
        await pending;
        await route.fulfill({
          headers: cors,
          json: {
            razao_social: "Razão da consulta",
            estabelecimento: {
              cnpj: numeric,
              nome_fantasia: "Fantasia da consulta",
              tipo_logradouro: "Rua",
              logradouro: "das Flores",
              numero: "42",
              complemento: "Sala 1",
              bairro: "Centro",
              cep: "20000000",
              cidade: { nome: "Rio de Janeiro" },
              estado: { sigla: "RJ" },
              ddd1: "21",
              telefone1: "22223333",
              email: "contato@example.test",
              inscricoes_estaduais: [
                {
                  inscricao_estadual: "998",
                  ativo: true,
                  estado: { sigla: "SP" },
                },
                {
                  inscricao_estadual: "997",
                  ativo: false,
                  estado: { sigla: "RJ" },
                },
                {
                  inscricao_estadual: "123",
                  ativo: true,
                  estado: { sigla: "RJ" },
                },
              ],
            },
          },
        });
      } else await route.fulfill({ headers: cors, status: 503 });
    });
    await page.route(minhaReceita + "*", (route) =>
      route.fulfill({ headers: cors, status: 503 }),
    );
    await form.getByLabel("Cidade").fill("Cidade digitada");
    await form.getByLabel("WhatsApp").fill("21987654321");
    await cnpj.fill("123");
    await lookup.click();
    await expect(form.getByRole("alert")).toContainText("Confira o CNPJ");
    expect(calls).toBe(0);
    await cnpj.fill("33.000.167/0001-01");
    await lookup.click();
    await expect(
      form.getByRole("button", { name: "Consultando…" }),
    ).toBeDisabled();
    respond();
    const mapped = {
      "Razão social": "Razão da consulta",
      "Nome fantasia": "Fantasia da consulta",
      Endereço: "Rua das Flores",
      Número: "42",
      Complemento: "Sala 1",
      Bairro: "Centro",
      Cidade: "Rio de Janeiro",
      UF: "RJ",
      CEP: "20000000",
      Telefone: "2122223333",
      "E-mail": "contato@example.test",
      "Inscrição estadual": "123",
    };
    for (const [label, value] of Object.entries(mapped))
      await expect(form.getByLabel(label, { exact: true })).toHaveValue(value);
    expect(calls).toBe(1);
    await form.getByLabel("Razão social").fill("Razão revisada");
    await cnpj.fill(numeric);
    await expect(form.getByLabel("Razão social")).toHaveValue("Razão revisada");
    await cnpj.fill(alphanumeric.toLowerCase());
    await expect(form.getByLabel("Razão social")).toHaveValue("");
    await expect(form.getByLabel("Cidade")).toHaveValue("Cidade digitada");
    await expect(form.getByLabel("WhatsApp")).toHaveValue("21987654321");
    await form.getByLabel("Nome / descrição").fill("Empresa manual no Spark");
    await lookup.click();
    await expect(form.getByRole("alert")).toContainText(
      "consulta está indisponível",
    );
    await expect(form.getByLabel("Nome / descrição")).toHaveValue(
      "Empresa manual no Spark",
    );
    await form.getByRole("button", { name: "Salvar empresa" }).click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Empresa manual no Spark" }),
    ).toBeVisible();
  });

  test("CNPJ já cadastrado gera pedido e informa quando o vínculo já existe", async ({
    page,
    browser,
  }) => {
    await signIn(page, credentials.email);
    const save = async (p: Page, name: string) => {
      const form = await openCompany(p);
      await form.getByLabel("CNPJ", { exact: true }).fill(duplicate);
      await form.getByLabel("Nome / descrição").fill(name);
      await form.getByRole("button", { name: "Salvar empresa" }).click();
      await expect(form).toBeHidden();
    };
    await save(page, "Empresa com CNPJ reservado");
    await expect(page.getByRole("status")).toContainText(
      "Registro salvo com sucesso",
    );
    await page.goto("/empresas");
    await save(page, "Segunda tentativa do mesmo inspetor");
    await expect(page.getByRole("status")).toContainText("Você já tem acesso");
    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      const requester = await other.newPage();
      await signIn(requester, credentials.companyInspectorEmail);
      await save(requester, "Tentativa de novo vínculo");
      await expect(requester.getByRole("status")).toContainText(
        "Pedido enviado",
      );
      await expect(
        requester.getByRole("button", { name: "Empresa com CNPJ reservado" }),
      ).toHaveCount(0);
      await expect(
        requester.getByRole("button", { name: "Tentativa de novo vínculo" }),
      ).toHaveCount(0);
    } finally {
      await other.close();
    }
  });
});
