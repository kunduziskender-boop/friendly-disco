import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const LAWYER_TEST_LOGIN = {
  email: "test@example.com",
  password: "password123",
} as const;

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function loginAsLawyerViaApi(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", { data: { ...LAWYER_TEST_LOGIN } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function deleteClientCascade(
  request: APIRequestContext,
  token: string,
  clientId: string,
): Promise<void> {
  const r = await request.delete(`/api/clients/${encodeURIComponent(clientId)}`, {
    headers: authHeaders(token),
  });
  if (r.status() === 204 || r.status() === 404) return;
  throw new Error(`DELETE client ${clientId}: ${r.status()} ${await r.text()}`);
}

export async function loginViaUi(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(`Email`).fill(LAWYER_TEST_LOGIN.email);
  await page.getByLabel(/Пароль/i).fill(LAWYER_TEST_LOGIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Вошли как")).toBeVisible({ timeout: 20_000 });
}

export async function patchClientName(
  request: APIRequestContext,
  token: string,
  clientId: string,
  name: string,
): Promise<void> {
  const r = await request.patch(`/api/clients/${encodeURIComponent(clientId)}`, {
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    data: { name },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

export async function apiCreateClient(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<string> {
  const tail = `${Date.now()}`.slice(-9);
  const res = await request.post("/api/clients", {
    headers: authHeaders(token),
    data: {
      name: `PW клиент ${suffix}`,
      phone: `+7913${tail}`,
      email: `pw_${suffix.replace(/\W/g, "_")}@example.com`,
      client_type: "individual",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function apiCreateCase(request: APIRequestContext, token: string, clientId: string, suffix: string) {
  const res = await request.post("/api/cases", {
    headers: authHeaders(token),
    data: {
      case_number: `PW-${suffix}`,
      title: `PW дело ${suffix}`,
      client_id: clientId,
      status: "open",
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string };
}
