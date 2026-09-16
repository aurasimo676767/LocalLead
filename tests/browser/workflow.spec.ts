import { test, expect } from "@playwright/test";
test("manual WhatsApp verification opens a confirmation containing only a draft link", async ({
  page,
}) => {
  await page.goto("/leads/new");
  await page
    .getByRole("textbox", { name: "Nome attività" })
    .fill("Fixture WhatsApp");
  await page
    .getByRole("textbox", { name: "Città", exact: true })
    .fill("Ragusa");
  await page
    .getByRole("textbox", { name: "Telefono pubblico" })
    .fill("+1 202 555 0123");
  await page
    .getByRole("button", { name: "Analizza lead", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fixture WhatsApp" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apri WhatsApp", exact: true }),
  ).toBeDisabled();
  const draft = page.getByRole("textbox", { name: "Messaggio suggerito" });
  await draft.fill("Ciao questa è una bozza manuale per verificare il numero");
  const uncertain = page.getByRole("button", {
    name: "Verifica su WhatsApp",
    exact: true,
  });
  await uncertain.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(uncertain).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Aggiorna stato" }),
  ).not.toHaveValue("contacted");
  await page.getByText("Verifica manuale", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "WhatsApp", exact: true })
    .selectOption("confirmed_business");
  await page
    .getByRole("combobox", { name: "Presenza sito", exact: true })
    .selectOption("none");
  await page
    .getByRole("textbox", { name: "URL della fonte" })
    .fill("https://example.com/test-evidence");
  await page
    .getByRole("textbox", { name: "Evidenza osservata" })
    .fill(
      "Fixture offline: numero business e assenza sito verificati per il test",
    );
  await page
    .getByRole("button", { name: "Salva verifica", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Verifica salvata");
  await page
    .getByRole("button", { name: /^(?:Ri)?[Gg]enera messaggio$/ })
    .click();
  await page
    .getByRole("button", { name: "Apri WhatsApp", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Apri WhatsApp", exact: true }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/12025550123\?text=/);
  await page.getByRole("button", { name: "Torna alla bozza" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await draft.fill("");
  await expect(
    page.getByRole("button", { name: "Apri WhatsApp", exact: true }),
  ).toBeDisabled();
  // Deliberately never follow the external link or send anything.
});

test("mobile menu keeps focus inside and lead cards fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/leads");
  const toggle = page.getByRole("button", { name: "Apri menu" });
  await toggle.click();
  const menu = page.getByRole("dialog", { name: "Menu principale" });
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(
      await menu.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Forno delle Nuvole", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/leads-mobile.png",
    fullPage: true,
  });
});

test("CSV imports 200 rows in batches and can retry a failed save", async ({
  page,
}) => {
  await page.goto("/leads/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "batch.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,city,category\n" +
        Array.from(
          { length: 200 },
          (_, i) => `Locale batch ${i},Ragusa,Pizzeria`,
        ).join("\n"),
    ),
  });
  await expect(page.getByText("Anteprima · 200 righe")).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === "locallead.workspace.v1" && ++calls === 2) {
        Storage.prototype.setItem = original;
        throw new DOMException("Spazio insufficiente", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Conferma import" }).click();
  await expect(page.getByText(/10 righe completate su 200/)).toBeVisible();
  await page.getByRole("button", { name: "Riprova righe rimanenti" }).click();
  await expect(page.getByText(/Import completato/)).toBeVisible();
  const count = await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("locallead.workspace.v1")!,
    );
    return workspace.leads.filter((lead: { name: string }) =>
      lead.name.startsWith("Locale batch"),
    ).length;
  });
  expect(count).toBe(200);
});
test("demo discovery, dedup, editable draft, CRM, opt-out and persistence", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Le prossime connessioni." }),
  ).toBeVisible();
  await page.goto("/discover");
  await page.getByRole("button", { name: "Cerca lead", exact: true }).click();
  await expect(page.getByText("Lead già presente").first()).toBeVisible();
  await page.goto("/leads");
  await page
    .getByRole("link", { name: "Forno delle Nuvole", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^(?:Ri)?[Gg]enera messaggio$/ })
    .click();
  const draft = page.getByRole("textbox", { name: "Messaggio suggerito" });
  await expect(draft).not.toHaveValue("");
  await draft.fill(
    "ciao, questa è una bozza modificata manualmente per il test",
  );
  await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Bozza salvata");
  await page
    .getByRole("button", { name: "Segna contattato", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Contatto registrato");
  await page.reload();
  await expect(draft).toHaveValue(
    "ciao, questa è una bozza modificata manualmente per il test",
  );
  await page
    .getByRole("button", { name: "Non mostrare più", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apri WhatsApp", exact: true }),
  ).toBeDisabled();
  await page.goto("/discover");
  await page.getByRole("button", { name: "Cerca lead", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /opportunità da rivedere/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Forno delle Nuvole", { exact: true }),
  ).toHaveCount(0);
});
test("manual import, CSV preview and mobile layout", async ({ page }) => {
  await page.goto("/leads/new");
  await page
    .getByRole("textbox", { name: "Nome attività" })
    .fill("Locale manuale test");
  await page
    .getByRole("textbox", { name: "Città", exact: true })
    .fill("Ragusa");
  await page
    .getByRole("button", { name: "Analizza lead", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Locale manuale test" }),
  ).toBeVisible();
  await page.goto("/leads/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "leads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,city,category\nLocale CSV,Ragusa,Pizzeria\nLocale CSV,Ragusa,Pizzeria",
    ),
  });
  await expect(page.getByText(/Anteprima · 2 righe/)).toBeVisible();
  await expect(page.getByText(/Lead già presente/)).toBeVisible();
  await page.getByRole("button", { name: "Conferma import" }).click();
  await expect(page.getByText(/Import completato/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Le prossime connessioni." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cambia tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
  });
});
