import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const credentials = JSON.parse(
  readFileSync(".emulator-credentials.json", "utf8"),
);
async function login(page: Page, owner = false) {
  await page.goto("/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(
      owner
        ? credentials.manufacturingOwnerEmail
        : credentials.manufacturingInspectorEmail,
    );
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await page
    .getByRole("button", { name: /Confecção Modelo — Demonstração/ })
    .click();
}

test.describe("Empresa modelo", () => {
  test.skip(
    process.env.NEXT_PUBLIC_API_MODE !== "firestore",
    "Exclusivo do Spark",
  );

  test("inspetor abre ficha, pedido, OF com duas cores e movimentação", async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("link", { name: "Cadastros", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Buscar cadastros" })
      .fill("produto");
    await page.getByRole("link", { name: /^Produtos/ }).click();
    await page
      .getByRole("button", { name: "Camiseta Básica", exact: true })
      .click();
    await expect(
      page.getByLabel("Cores disponíveis", { exact: true }),
    ).toHaveValues(["azul-marinho", "branco", "preto"]);
    await page.getByRole("link", { name: "Malha penteada 30/1" }).click();
    await expect(page.getByLabel("Fornecedores", { exact: true })).toHaveValues(
      ["alfa", "beta"],
    );
    await page.reload();
    await expect(
      page.getByRole("dialog", { name: "Malha penteada 30/1" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fechar formulário" }).click();
    await page.getByRole("link", { name: "Pedidos", exact: true }).click();
    await page.getByRole("button", { name: "PED-1042", exact: true }).click();
    await expect(
      page.getByText("Peças programadas").locator(".."),
    ).toContainText("180");
    await expect(
      page.getByText("Peças a programar", { exact: true }).locator(".."),
    ).toContainText("60");
    await page.getByRole("link", { name: "OF-0087", exact: true }).click();
    await expect(page.getByRole("heading", { name: /OF-0087/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /OF-0087/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Grade da OF.*180/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Produção", exact: true }).click();
    await expect(
      page.getByText("Movimentações de produção", { exact: true }),
    ).toBeVisible();
  });

  test("programa e cancela uma OF parcial em duas cores", async ({ page }) => {
    await login(page);
    const id = Date.now().toString(36).toUpperCase();
    await page.goto("/pedidos?id=novo");
    await page.getByLabel("Número do pedido").fill("QA-" + id);
    await page
      .getByRole("combobox", { name: /^Cliente/ })
      .selectOption("cliente");
    await page
      .getByRole("combobox", { name: /^Fluxo sugerido/ })
      .selectOption("camiseta");
    await page
      .getByRole("combobox", { name: /^Produto/ })
      .selectOption("cam-001");
    await page.getByLabel("Preto", { exact: true }).check();
    await page.getByLabel("Azul-marinho", { exact: true }).check();
    await page
      .getByRole("spinbutton", { name: "Peças Preto P", exact: true })
      .fill("10");
    await page
      .getByRole("spinbutton", { name: "Peças Azul-marinho M", exact: true })
      .fill("10");
    await page
      .getByRole("spinbutton", { name: "Folhas Preto", exact: true })
      .fill("3");
    await page.getByRole("button", { name: "Salvar pedido" }).click();
    await expect(
      page.getByRole("heading", { name: "QA-" + id, exact: true }),
    ).toBeVisible(opts);
    await page.getByRole("button", { name: "Gerar OF" }).click();
    const dialog = page.getByRole("dialog", { name: "Gerar OF" });
    await dialog.getByLabel("Número da OF").fill("OF-QA-" + id);
    await dialog
      .getByRole("spinbutton", { name: "Peças Preto P", exact: true })
      .fill("6");
    await dialog
      .getByRole("spinbutton", { name: "Peças Azul-marinho M", exact: true })
      .fill("4");
    await dialog
      .getByRole("spinbutton", { name: "Folhas Preto", exact: true })
      .fill("2");
    await dialog.getByRole("button", { name: "Confirmar OF" }).click();
    await expect(
      page.getByRole("heading", { name: /Grade da OF.*10/ }),
    ).toBeVisible(opts);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancelar OF" }).click();
    await expect(page.getByRole("button", { name: "Cancelar OF" })).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "QA-" + id, exact: true }).click();
    await expect(
      page.getByText("Peças a programar", { exact: true }).locator(".."),
    ).toContainText("20");
  });

  test("proprietário consulta pedido e OF sem controles de escrita", async ({
    page,
  }) => {
    await login(page, true);
    await page.goto("/pedidos?id=ped-1042");
    await expect(
      page.getByRole("heading", { name: "PED-1042", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar OF" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Editar pedido" })).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "OF-0087", exact: true }).click();
    await expect(page.getByRole("heading", { name: /OF-0087/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Editar projeto" }),
    ).toHaveCount(0);
  });
});
