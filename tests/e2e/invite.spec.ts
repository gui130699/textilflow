import { expect, test } from "@playwright/test";

test("Criar conta abre o cadastro por convite", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Criar conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Criar conta" }),
  ).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);

  const token = "a".repeat(64);
  const field = page.getByLabel("Link do convite");
  const submit = page.getByRole("button", { name: "Continuar com convite" });
  await field.fill(`https://example.com/convite#${token}`);
  await submit.click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Cole o link completo",
  );
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);

  const inviteUrl = new URL(`/convite#${token}`, page.url()).href;
  await field.fill(inviteUrl);
  await submit.click();
  await expect(page).toHaveURL(inviteUrl);
  await expect(
    page.getByRole("button", { name: "Criar minha conta" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Criar minha conta" }),
  ).toBeVisible();
});
