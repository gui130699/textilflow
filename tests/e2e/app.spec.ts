import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentials = JSON.parse(
  readFileSync(".emulator-credentials.json", "utf8"),
);
const spark = process.env.NEXT_PUBLIC_API_MODE === "firestore";
const itaboraiUrl = spark
  ? "/projetos/detalhe?id=itaborai"
  : "/projetos/itaborai";
async function login(page: Page, owner = false) {
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(owner ? credentials.ownerEmail : credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Qual empresa vamos acompanhar?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Confecção Exemplo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral da produção" }),
  ).toBeVisible();
}
test("protege rota sem sessão", async ({ page }) => {
  await page.goto("/projetos");
  await expect(page).toHaveURL(/login/);
  await expect(
    page.getByRole("heading", { name: "Sua produção começa aqui." }),
  ).toBeVisible();
});
test("consulta CNPJ preenche a nova empresa e permite revisão", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_API_MODE !== "server" && !spark,
    "Consulta de CNPJ do piloto ou Spark",
  );
  await login(page);
  await page.goto("/cadastros/companies");
  await page.getByRole("button", { name: "Cadastrar nova empresa" }).click();
  if (spark) {
    await page.route("https://publica.cnpj.ws/cnpj/33000167000101", (route) =>
      route.fulfill({
        headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3000" },
        json: {
          razao_social: "Empresa Exemplo Ltda.",
          estabelecimento: {
            cnpj: "33000167000101",
            nome_fantasia: "Empresa Exemplo",
            cidade: { nome: "Rio de Janeiro" },
            estado: { sigla: "RJ" },
            inscricoes_estaduais: [
              {
                inscricao_estadual: "12345",
                ativo: true,
                estado: { sigla: "RJ" },
              },
            ],
          },
        },
      }),
    );
  } else
    await page.route("**/api/operations/lookupCompanyCnpj", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        taxId: "33000167000101",
      });
      await route.fulfill({
        json: {
          result: {
            source: "CNPJ.ws",
            fields: {
              taxId: "33000167000101",
              name: "Empresa Exemplo",
              legalName: "Empresa Exemplo Ltda.",
              city: "Rio de Janeiro",
              stateRegistration: "12345",
            },
          },
        },
      });
    });
  await page.getByLabel("CNPJ", { exact: true }).fill("33.000.167/0001-01");
  await page.getByRole("button", { name: "Consultar CNPJ" }).click();
  await expect(page.getByLabel("Razão social")).toHaveValue(
    "Empresa Exemplo Ltda.",
  );
  await expect(page.getByLabel("Cidade")).toHaveValue("Rio de Janeiro");
  await expect(page.getByLabel("Inscrição estadual")).toHaveValue("12345");
  await expect(page.getByLabel("WhatsApp")).toHaveValue("");
  await page.getByLabel("WhatsApp").fill("21999999999");
  await expect(page.getByLabel("WhatsApp")).toHaveValue("21999999999");
});
test("login inválido mostra mensagem útil", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill("invalid-test-input");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "E-mail ou senha incorretos",
  );
});
test("recuperação de senha", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "instruções de recuperação",
  );
});
test("dashboard, projeto e reconciliação", async ({ page }) => {
  await login(page);
  await expect(page.getByText("3.000", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Itaboraí", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Itaboraí/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Conferir saldos com histórico" })
    .click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "sem divergências",
  );
  await page.screenshot({
    path: "test-results/dashboard-project.png",
    fullPage: true,
  });
});
test("cadastro, pesquisa e edição real de cliente", async ({ page }) => {
  await login(page);
  await page.goto("/cadastros/clients");
  await page.getByRole("button", { name: "Adicionar cliente" }).click();
  const name = `Cliente navegador ${Date.now()}`;
  await page.getByLabel("Nome / descrição").fill(name);
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.locator(".notice[role=status]")).toContainText(
    "salvo com sucesso",
  );
  await page.getByLabel("Pesquisar registros").fill(name);
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByLabel("Observações", { exact: true })
    .fill("Editado no teste de navegador");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
test("novo projeto, modelagem e corte pelo formulário", async ({ page }) => {
  await login(page);
  await page.goto("/projetos");
  await page.getByRole("button", { name: "Novo projeto" }).click();
  const name = `Projeto navegador ${Date.now()}`;
  await page.getByLabel("Nome do projeto", { exact: false }).fill(name);
  await page
    .getByLabel("Cliente", { exact: false })
    .filter({ has: page.locator("option") })
    .selectOption("demo-0");
  await page.locator("select#productId").selectOption("demo-0");
  await page
    .getByLabel("Quantidade prevista (peças)", { exact: false })
    .fill("500");
  await page
    .getByLabel("Responsável", { exact: false })
    .fill("Inspetor navegador");
  await page.getByRole("button", { name: "Salvar projeto" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(name) }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Modelagem", exact: true }).click();
  await page.getByRole("button", { name: "Novo registro" }).click();
  await page.getByLabel("Responsável", { exact: false }).fill("Modelista");
  await page.locator("select#status").selectOption("Liberada");
  await page.getByRole("button", { name: "Confirmar registro" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("tab", { name: "Produção", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar corte", exact: true })
    .click();
  await page.getByLabel("Quantidade de peças", { exact: false }).fill("100");
  await page.getByRole("button", { name: "Confirmar registro" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.locator(".metric").filter({ hasText: "Corte acumulado" }),
  ).toContainText("100");
  if (spark) {
    const url = page.url();
    expect(url).toContain("/projetos/detalhe?id=");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: new RegExp(name) }),
    ).toBeVisible();
    await expect(
      page.locator(".metric").filter({ hasText: "Corte acumulado" }),
    ).toContainText("100");
  }
});
test("proprietário consulta e não vê operações de escrita", async ({
  page,
}) => {
  await login(page, true);
  await page.goto(itaboraiUrl);
  await expect(
    page.getByRole("button", { name: "Editar projeto" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Produção", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Registrar corte", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Movimentações de produção", { exact: true }),
  ).toBeVisible();
});
test("relatórios com filtro e exportação CSV", async ({ page }) => {
  await login(page);
  await page.goto("/relatorios");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(
    page.getByRole("cell", { name: "Itaboraí", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  expect((await download).suggestedFilename()).toBe("textilflow-relatorio.csv");
});
test("layout responsivo e navegação móvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("link", { name: "Projetos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projetos", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-projects.png",
    fullPage: true,
  });
});

for (const [kind, label] of [
  ["companies", "empresa"],
  ["thirdParties", "terceiro"],
  ["suppliers", "fornecedor"],
  ["materials", "material"],
  ["products", "produto"],
  ["models", "modelo"],
  ["modules", "módulo"],
] as const) {
  test(`cadastro funcional de ${label}`, async ({ page }) => {
    await login(page);
    await page.goto(`/cadastros/${kind}`);
    await page
      .getByRole("button", {
        name:
          kind === "companies"
            ? "Cadastrar nova empresa"
            : `Adicionar ${label}`,
        exact: true,
      })
      .click();
    await page
      .getByLabel("Nome / descrição")
      .fill(`Teste ${label} ${Date.now()}`);
    if (kind === "models")
      await page.locator("select#productId").selectOption("demo-0");
    if (spark && kind === "companies")
      await page.getByLabel("CNPJ", { exact: true }).fill("12.ABC.345/01DE-35");
    await page
      .getByRole("button", {
        name: kind === "companies" ? "Salvar empresa" : "Salvar registro",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".notice[role=status]")).toContainText(
      "salvo com sucesso",
    );
  });
}
test("anexo real valida conteúdo, permite download e é visível ao proprietário autorizado", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_API_MODE === "server" || spark,
    "Anexos indisponíveis no piloto",
  );
  await login(page);
  await page.goto(itaboraiUrl);
  await page.getByRole("tab", { name: "Fotos e anexos", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("input[type=file]").setInputFiles({
    name: "conteudo-invalido.png",
    mimeType: "image/png",
    buffer: Buffer.from("arquivo que não é imagem"),
  });
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Formato de arquivo inválido",
  );
  const filename = `inspecao-${Date.now()}.png`;
  await page.locator("input[type=file]").setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: readFileSync("public/icon-192.png"),
  });
  const file = page.getByRole("button", { name: new RegExp(filename) });
  await expect(file).toBeVisible();
  const download = page.waitForEvent("download");
  await file.click();
  expect((await download).suggestedFilename()).toBe(filename);
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await login(page, true);
  await page.goto(itaboraiUrl);
  await page.getByRole("tab", { name: "Fotos e anexos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(filename) }),
  ).toBeVisible();
});
test("imagem de modelo é enviada e carregada pelo Storage autenticado", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_API_MODE === "server" || spark,
    "Imagens indisponíveis no piloto",
  );
  await login(page);
  await page.goto("/cadastros/models");
  await page.getByLabel("Pesquisar registros").fill("Camiseta básica");
  await page
    .getByRole("button", { name: "Camiseta básica", exact: true })
    .click();
  await page
    .getByLabel("Enviar imagem", { exact: true })
    .setInputFiles("public/icon-192.png");
  await expect(
    page.getByRole("img", { name: "Imagem do modelo", exact: true }),
  ).toBeVisible();
});

test("API do piloto rejeita sessão ausente ou inválida e bloqueia a rota de anexos", async ({
  request,
}) => {
  test.skip(process.env.NEXT_PUBLIC_API_MODE !== "server", "Apenas no piloto");
  const missing = await request.post("/api/operations/companiesForUser", {
    data: {},
  });
  expect(missing.status()).toBe(401);
  const invalid = await request.post("/api/operations/companiesForUser", {
    headers: { Authorization: "Bearer fake-token" },
    data: {},
  });
  expect(invalid.status()).toBe(401);
  const upload = await request.post("/api/operations/saveAttachment", {
    data: {},
  });
  expect(upload.status()).toBe(404);
});

test("Spark não consulta Render, Functions ou Storage", async ({ page }) => {
  test.skip(!spark, "Exclusivo da saída estática");
  const forbidden: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (
      url.pathname.startsWith("/api/operations") ||
      url.port === "5001" ||
      url.port === "9199" ||
      /onrender\.com|cloudfunctions\.net|firebasestorage\.googleapis\.com/.test(
        url.hostname,
      )
    )
      forbidden.push(url.origin);
  });
  await login(page, true);
  await page.goto(itaboraiUrl);
  await expect(page.getByRole("heading", { name: /^Itaboraí/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fotos e anexos" })).toHaveCount(
    0,
  );
  expect(forbidden).toEqual([]);
});
