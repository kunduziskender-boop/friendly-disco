import { test, expect } from "@playwright/test";
import {
  LAWYER_TEST_LOGIN,
  apiCreateCase,
  apiCreateClient,
  deleteClientCascade,
  loginAsLawyerViaApi,
  loginViaUi,
  patchClientName,
} from "./helpers";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

test("Вход — войти под своей ролью и попасть в рабочий интерфейс", async ({ page }) => {
  await loginViaUi(page);
  await expect(page.getByText("Юрист").first()).toBeVisible();
  await expect(page.getByText(LAWYER_TEST_LOGIN.email)).toBeVisible();
});

test("Клиент — создать, найти в списке, открыть карточку, изменить данные через API и проверить в UI", async ({
  page,
  request,
}) => {
  const token = await loginAsLawyerViaApi(request);
  let clientId: string | null = null;

  try {
    await loginViaUi(page);

    await page.getByRole("button", { name: "клиенты", exact: true }).click();

    const name = `PW Клиент ${uniqueSuffix()}`;
    const renamed = `${name} (обновлено)`;
    const newClientSection = page.locator("section").filter({ hasText: "Новый клиент" });
    await newClientSection.getByLabel("ФИО").fill(name);
    await newClientSection.getByLabel("Телефон").fill("+79165550101");
    await newClientSection.getByLabel("Email").fill(`pw.${uniqueSuffix()}@example.com`);

    const [clientRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/clients") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить клиента" }).click(),
    ]);
    const body = (await clientRes.json()) as { id: string };
    clientId = body.id;

    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await page.getByRole("button", { name: "✕" }).click();

    await patchClientName(request, token, clientId, renamed);
    await page.reload();
    await page.getByRole("button", { name: "клиенты", exact: true }).click();
    await expect(page.getByText(renamed, { exact: true }).first()).toBeVisible();
  } finally {
    if (clientId) await deleteClientCascade(request, token, clientId);
  }
});

test("Дело — завести дело, привязать к клиенту, видеть в списке и деталях", async ({ page, request }) => {
  const token = await loginAsLawyerViaApi(request);
  let clientId: string | null = null;

  try {
    await loginViaUi(page);
    const tag = uniqueSuffix();
    const clientName = `PW для дела ${tag}`;
    const caseTitle = `PW дело UI ${tag}`;

    await page.getByRole("button", { name: "клиенты", exact: true }).click();
    const newClientSection = page.locator("section").filter({ hasText: "Новый клиент" });
    await newClientSection.getByLabel("ФИО").fill(clientName);
    await newClientSection.getByLabel("Телефон").fill("+79165550202");
    await newClientSection.getByLabel("Email").fill(`pwcase.${tag}@example.com`);

    const [clientRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/clients") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить клиента" }).click(),
    ]);
    clientId = ((await clientRes.json()) as { id: string }).id;

    await page.getByRole("button", { name: "дела", exact: true }).click();
    const newCase = page.locator("section").filter({ hasText: "Новое дело" });
    await newCase.getByLabel("Клиент").selectOption({ label: clientName });
    await newCase.getByLabel(/Название \/ номер дела/i).fill(caseTitle);
    await newCase.getByLabel(/Суд \/ орган/i).fill("Арбитраж ПW");

    const [caseRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/cases") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить дело" }).click(),
    ]);
    await caseRes.json();

    await expect(page.getByText(caseTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`(${clientName})`).first()).toBeVisible();

    await page.getByRole("button", { name: "клиенты", exact: true }).click();
    await page
      .getByRole("button", { name: new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      .click();
    await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
    await expect(page.getByText(caseTitle)).toBeVisible();
    await page.getByRole("button", { name: "✕" }).click();
  } finally {
    if (clientId) await deleteClientCascade(request, token, clientId);
  }
});

test("Календарь — запланировать встречу с датой и привязкой к клиенту", async ({ page, request }) => {
  const token = await loginAsLawyerViaApi(request);
  let clientId: string | null = null;

  try {
    await loginViaUi(page);
    const tag = uniqueSuffix();
    const clientName = `PW для календаря ${tag}`;
    const meetingTopic = `PW встреча ${tag}`;
    await page.getByRole("button", { name: "клиенты", exact: true }).click();

    const newClientSection = page.locator("section").filter({ hasText: "Новый клиент" });
    await newClientSection.getByLabel("ФИО").fill(clientName);
    await newClientSection.getByLabel("Телефон").fill("+79165550303");
    await newClientSection.getByLabel("Email").fill(`pwcal.${tag}@example.com`);

    const [clientRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/clients") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить клиента" }).click(),
    ]);
    clientId = ((await clientRes.json()) as { id: string }).id;

    await page.getByRole("button", { name: "встречи", exact: true }).click();
    const form = page.locator("section").filter({ hasText: "Новая встреча" });
    await expect(form.getByLabel("Клиент").locator("option", { hasText: clientName })).toBeAttached({
      timeout: 15_000,
    });
    await form.getByLabel("Клиент").selectOption({ label: clientName });
    await form.getByLabel("Тема").fill(meetingTopic);
    await form.getByLabel("Дата").fill("31122031");
    await form.getByLabel("Время").fill("14:30");
    await form.getByLabel("Место").fill("Офис PW");

    const [evRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/calendar-events") && r.ok(),
      ),
      page.getByRole("button", { name: "Запланировать" }).click(),
    ]);
    await evRes.json();

    await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: meetingTopic })).toBeVisible();
    await expect(page.getByText("офис PW").first()).toBeVisible();
  } finally {
    if (clientId) await deleteClientCascade(request, token, clientId);
  }
});

test("Финансы — записать операцию с суммой и привязкой к клиенту и делу", async ({ page, request }) => {
  const token = await loginAsLawyerViaApi(request);
  let clientId: string | null = null;

  try {
    await loginViaUi(page);
    const tag = uniqueSuffix();

    await page.getByRole("button", { name: "клиенты", exact: true }).click();
    const newClientSection = page.locator("section").filter({ hasText: "Новый клиент" });
    await newClientSection.getByLabel("ФИО").fill(`PW финансы клиент ${tag}`);
    await newClientSection.getByLabel("Телефон").fill("+79165550404");
    await newClientSection.getByLabel("Email").fill(`pwfin.${tag}@example.com`);

    const [clientRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/clients") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить клиента" }).click(),
    ]);
    clientId = ((await clientRes.json()) as { id: string }).id;

    await page.getByRole("button", { name: "дела", exact: true }).click();
    const newCase = page.locator("section").filter({ hasText: "Новое дело" });
    await newCase
      .getByLabel("Клиент")
      .selectOption({ label: `PW финансы клиент ${tag}` });
    await newCase.getByLabel(/Название \/ номер дела/i).fill(`PW дело для фин ${tag}`);
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/cases") && r.ok(),
      ),
      page.getByRole("button", { name: "Добавить дело" }).click(),
    ]);

    await page.getByRole("button", { name: "финансы", exact: true }).click();
    const fin = page.locator("section").filter({ hasText: "Новая запись" });
    await fin.getByLabel("Сумма").fill("15000");
    await fin.getByLabel("Дата").fill("31122031");
    await fin.getByLabel(/Клиент/).selectOption({ label: `PW финансы клиент ${tag}` });
    await fin.getByLabel(/Дело/).selectOption({ label: `PW дело для фин ${tag}` });
    await fin.getByLabel("Описание").fill(`PW описание платежа ${tag}`);

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && r.url().includes("/api/finance-records") && r.ok(),
      ),
      fin.getByRole("button", { name: "Добавить запись" }).click(),
    ]);

    await expect(page.getByText(/15\s*000/).first()).toBeVisible();
    await expect(page.getByText(`PW описание платежа ${tag}`).first()).toBeVisible();
  } finally {
    if (clientId) await deleteClientCascade(request, token, clientId);
  }
});

test("Задачи — поставить задачу по делу со сроком и отметить выполненной (API: в приложении нет экрана задач)", async ({
  request,
}) => {
  const token = await loginAsLawyerViaApi(request);
  const tag = uniqueSuffix();
  const clientId = await apiCreateClient(request, token, tag);
  const legalCase = await apiCreateCase(request, token, clientId, tag);

  try {
    const createRes = await request.post("/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: `PW задача ${tag}`,
        due_date: "2030-06-01T12:00:00+03:00",
        status: "todo",
        priority: "high",
        case_id: legalCase.id,
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const task = (await createRes.json()) as { id: string };

    const patchRes = await request.patch(`/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "done" },
    });
    expect(patchRes.ok(), await patchRes.text()).toBeTruthy();
    const updated = (await patchRes.json()) as { status: string };
    expect(updated.status).toBe("done");
  } finally {
    await deleteClientCascade(request, token, clientId);
  }
});

test("Документы — добавить документ к делу и увидеть в списке (API: в приложении нет экрана документов)", async ({
  request,
}) => {
  const token = await loginAsLawyerViaApi(request);
  const tag = uniqueSuffix();
  const clientId = await apiCreateClient(request, token, tag);
  const legalCase = await apiCreateCase(request, token, clientId, tag);

  try {
    const createDoc = await request.post("/api/documents", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: `PW договор ${tag}`,
        doc_type: "contract",
        case_id: legalCase.id,
        status: "draft",
        file_name: `pw-${tag}.pdf`,
      },
    });
    expect(createDoc.ok(), await createDoc.text()).toBeTruthy();

    const list = await request.get(
      `/api/documents?case_id=${encodeURIComponent(legalCase.id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(list.ok()).toBeTruthy();
    const rows = (await list.json()) as { title: string }[];
    expect(rows.some((d) => d.title === `PW договор ${tag}`)).toBeTruthy();
  } finally {
    await deleteClientCascade(request, token, clientId);
  }
});
