/**
 * API client for Lawyer CRM backend
 *
 * Responsibilities:
 *  - token management (JWT in localStorage)
 *  - base fetch wrapper with error normalisation
 *  - type adapters: backend snake_case ↔ frontend camelCase
 *  - status mapping: Russian frontend statuses ↔ English backend enums
 */

import type {
  Appointment,
  CaseStatus,
  Client,
  FinanceRecord,
  FinanceStatus,
  FinanceType,
  LegalCase,
} from "./types";

/**
 * База для всех путей вида `/clients`, `/auth/login` (без завершающего `/`).
 *
 * - `VITE_API_ROOT` — приоритет: полный префикс (`http://127.0.0.1:8000/api` или для старого бэкенда `http://127.0.0.1:8000`).
 * - иначе `VITE_API_BASE` + `/api`, кроме `VITE_API_LEGACY=true` (старый бэкенд без `/api`).
 * - в `npm run dev`: по умолчанию `/api` (прокси в vite.config.ts → 127.0.0.1:8010).
 */
function computeApiRoot(): string {
  const rootRaw = import.meta.env.VITE_API_ROOT?.trim();
  if (rootRaw) {
    let root = rootRaw.replace(/\/+$/, "");
    // Без https:// браузер считает URL относительным к pages.dev → 404 вроде ".../lawyer-crm-api/auth/login"
    if (root.startsWith("//")) {
      root = `https:${root}`;
    } else if (!/^https?:\/\//i.test(root)) {
      root = `https://${root}`;
    }
    return root;
  }

  const baseRaw = import.meta.env.VITE_API_BASE?.trim();
  if (baseRaw) {
    let b = baseRaw.replace(/\/+$/, "");
    if (b.startsWith("//")) {
      b = `https:${b}`;
    } else if (!/^https?:\/\//i.test(b)) {
      b = `https://${b}`;
    }
    return import.meta.env.VITE_API_LEGACY === "true" ? b : `${b}/api`;
  }

  if (import.meta.env.DEV) return "/api";
  return "http://127.0.0.1:8010/api";
}

const API = computeApiRoot();

// ── Token ────────────────────────────────────────────────────────────────────

let _token = localStorage.getItem("crm_token") ?? "";

export const auth = {
  hasToken: () => !!_token,
  set(t: string) {
    _token = t;
    localStorage.setItem("crm_token", t);
  },
  clear() {
    _token = "";
    localStorage.removeItem("crm_token");
  },
};

// ── Error class ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Сбрасывает сессию при 401 на защищённых запросах; слушатель — в `App.tsx`. */
export const AUTH_EXPIRED_EVENT = "crm-auth-expired";

// ── Base request ─────────────────────────────────────────────────────────────

function formatHttpError(status: number, data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  if (Array.isArray((data as { detail?: unknown })?.detail)) {
    return ((data as { detail: { msg: string }[] }).detail).map((d) => d.msg).join("; ");
  }
  const d = (data as { detail?: { message?: string } | string } | null)?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && "message" in d && typeof (d as { message: string }).message === "string") {
    return (d as { message: string }).message;
  }
  return `Ошибка ${status}`;
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }
  const hadToken = !!_token;
  if (_token) headers.Authorization = `Bearer ${_token}`;

  const url = API + path;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const hint =
      import.meta.env.DEV && API.startsWith("/api")
        ? " Проверьте, что бэкенд запущен (по умолчанию порт 8010, см. vite.config.ts) и прокси Vite включён."
        : " Проверьте адрес API (VITE_API_ROOT / VITE_API_BASE) и что сервер запущен.";
    throw new ApiError(
      0,
      e instanceof Error ? `${e.message}.${hint}` : `Сеть недоступна.${hint}`
    );
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      auth.clear();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }
    let msg = formatHttpError(res.status, data);
    if (res.status === 404) {
      msg += ` (${method} ${url}).`;
      const isLeadRemoval =
        path.startsWith("/leads/") &&
        (method === "DELETE" || path.endsWith("/delete"));
      if (isLeadRemoval) {
        msg +=
          " На этом URL нет удаления лида — обычно крутится старая копия API или другой порт." +
          " Поднимите актуальный `backend`: `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8010` (или свой порт) и чтобы фронт бился в тот же адрес (`vite.config.ts` proxy или `VITE_API_ROOT=http://127.0.0.1:8010/api`)." +
          " В Swagger (`/docs`) должны быть `DELETE /api/leads/{lead_id}` и `POST /api/leads/{lead_id}/delete`.";
      } else if (method === "DELETE") {
        msg +=
          " Убедитесь, что на сервере последняя версия API и один экземпляр бэкенда с одной базой crm.db.";
      } else {
        msg +=
          " Частая причина: запрос уходит не в тот процесс (старый uvicorn без префикса /api на :8000) — остановите лишнее и запустите из каталога backend см. README; порт по умолчанию 8010.";
      }
    } else if (res.status === 405 || res.status === 501) {
      msg +=
        ` Метод ${method} не поддерживается — обновите бэкенд и перезапустите его из каталога backend (эндпоинты удаления лида под /api/leads).`;
    }
    throw new ApiError(res.status, msg);
  }

  return data as T;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<void> {
  const data = await req<{ access_token: string }>("POST", "/auth/login", {
    email,
    password,
  });
  auth.set(data.access_token);
}

export async function register(
  fullName: string,
  email: string,
  password: string
): Promise<void> {
  const data = await req<{ access_token: string }>("POST", "/auth/register", {
    full_name: fullName,
    email,
    password,
  });
  auth.set(data.access_token);
}

export type MeRole = "admin" | "lawyer" | "assistant";

/** Ответ GET /auth/me после входа */
export interface MeUser {
  id: string;
  full_name: string;
  email: string;
  role: MeRole;
  is_active: boolean;
  created_at: string;
}

/** Текущий пользователь из JWT (понятно после входа, кто вы и с какой ролью). */
export async function fetchMe(): Promise<MeUser> {
  return req<MeUser>("GET", "/auth/me");
}

/** Короткая подпись роли для UI */
export function roleTitleRu(role: string): string {
  switch (role) {
    case "admin":
      return "Администратор";
    case "lawyer":
      return "Юрист";
    case "assistant":
      return "Помощник";
    default:
      return role;
  }
}

/** Одна строка-пояснение возможностей (для заголовка / экрана входа) */
export function roleHintRu(role: string): string {
  switch (role) {
    case "admin":
      return "Полный доступ, управление пользователями и всеми данными.";
    case "lawyer":
      return "Все клиенты и дела, финансы, расширенные права в CRM.";
    case "assistant":
      return "Свои клиенты и связанные записи; удаление своих клиентов без привязанных дел.";
    default:
      return "";
  }
}

// ── Backend response shapes ───────────────────────────────────────────────────

interface BClient {
  id: string;
  name: string;
  phone: string;
  email: string;
  client_type: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface BCase {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  status: string;
  client_id: string;
  responsible_lawyer_id: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface BEvent {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  event_type: string;
  case_id: string | null;
  client_id?: string | null;
  participants: string[];
  created_by: string;
}

// ── Status mapping ────────────────────────────────────────────────────────────

const TO_BACKEND: Record<CaseStatus, string> = {
  новое: "open",
  "в работе": "in_progress",
  суд: "in_progress",
  закрыто: "closed",
};

const FROM_BACKEND: Record<string, CaseStatus> = {
  open: "новое",
  in_progress: "в работе",
  closed: "закрыто",
  archived: "закрыто",
};

// ── Adapters ──────────────────────────────────────────────────────────────────

function toClient(b: BClient): Client {
  return {
    id: b.id,
    name: b.name,
    phone: b.phone,
    email: b.email,
    notes: b.notes ?? "",
    createdAt: b.created_at,
  };
}

/**
 * Extra frontend-only fields are stored as JSON in the backend's description.
 * Shape: { court, deadline, summary, fs (frontendStatus) }
 */
interface CaseMeta {
  court?: string;
  deadline?: string;
  summary?: string;
  fs?: CaseStatus;
}

function parseMeta<T>(raw: string | null): T {
  try {
    return JSON.parse(raw ?? "{}") as T;
  } catch {
    return {} as T;
  }
}

function toCase(b: BCase): LegalCase {
  const m = parseMeta<CaseMeta>(b.description);
  return {
    id: b.id,
    clientId: b.client_id,
    title: b.title,
    courtOrAuthority: m.court ?? "",
    nextDeadline: m.deadline ?? "",
    summary: m.summary ?? "",
    // fs (frontendStatus) preserves values like "суд" across round-trips
    status: m.fs ?? FROM_BACKEND[b.status] ?? "новое",
  };
}

interface EventMeta {
  place?: string;
  clientId?: string;
}

function toAppointment(b: BEvent): Appointment {
  const m = parseMeta<EventMeta>(b.description);
  const fromApi = b.client_id ?? "";
  return {
    id: b.id,
    title: b.title,
    clientId: fromApi || m.clientId || b.participants[0] || "",
    at: b.start_at,
    place: m.place ?? "",
  };
}

// ── Clients API ───────────────────────────────────────────────────────────────

export const clientsApi = {
  async list(): Promise<Client[]> {
    return (await req<BClient[]>("GET", "/clients")).map(toClient);
  },

  async create(c: Omit<Client, "id" | "createdAt">): Promise<Client> {
    // Normalise phone (remove spaces) and fall back to a placeholder if empty
    const phone = c.phone.replace(/\s/g, "") || "+70000000000";
    const email = c.email.trim() || `user${Date.now()}@example.com`;

    return toClient(
      await req<BClient>("POST", "/clients", {
        name: c.name,
        phone,
        email,
        client_type: "individual",
        ...(c.notes ? { notes: c.notes } : {}),
      })
    );
  },

  async remove(id: string): Promise<void> {
    await req<void>("DELETE", `/clients/${id}`);
  },
};

// ── Cases API ─────────────────────────────────────────────────────────────────

export const casesApi = {
  async list(): Promise<LegalCase[]> {
    return (await req<BCase[]>("GET", "/cases")).map(toCase);
  },

  async create(c: Omit<LegalCase, "id">): Promise<LegalCase> {
    const description = JSON.stringify({
      court: c.courtOrAuthority,
      deadline: c.nextDeadline,
      summary: c.summary,
      fs: c.status,
    } satisfies CaseMeta);

    return toCase(
      await req<BCase>("POST", "/cases", {
        case_number: `CASE-${Date.now()}`,
        title: c.title,
        client_id: c.clientId,
        status: TO_BACKEND[c.status],
        description,
      })
    );
  },

  async updateStatus(id: string, status: CaseStatus): Promise<LegalCase> {
    // Fetch current case to keep existing meta intact
    const current = await req<BCase>("GET", `/cases/${id}`);
    const meta = parseMeta<CaseMeta>(current.description);
    const description = JSON.stringify({ ...meta, fs: status } satisfies CaseMeta);

    return toCase(
      await req<BCase>("PATCH", `/cases/${id}`, {
        status: TO_BACKEND[status],
        description,
      })
    );
  },

  async remove(id: string): Promise<void> {
    await req<void>("DELETE", `/cases/${id}`);
  },
};

// ── Calendar Events API ───────────────────────────────────────────────────────

export const eventsApi = {
  async list(): Promise<Appointment[]> {
    return (await req<BEvent[]>("GET", "/calendar-events")).map(toAppointment);
  },

  async create(a: Omit<Appointment, "id">): Promise<Appointment> {
    const start = new Date(a.at);
    if (isNaN(start.getTime())) throw new ApiError(0, "Некорректная дата/время");

    const end = new Date(start.getTime() + 60 * 60_000);
    const description = JSON.stringify({
      place: a.place,
      clientId: a.clientId,
    } satisfies EventMeta);

    return toAppointment(
      await req<BEvent>("POST", "/calendar-events", {
        title: a.title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        description,
        event_type: "meeting",
        client_id: a.clientId || null,
        participants: [],
      })
    );
  },
};

// ── Finance API ───────────────────────────────────────────────────────────────

interface BFinance {
  id: string;
  record_type: string;
  amount: number;
  currency: string;
  payment_date: string;
  status: string;
  client_id: string | null;
  case_id: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
}

function toFinance(b: BFinance): FinanceRecord {
  return {
    id: b.id,
    recordType: b.record_type as FinanceType,
    amount: b.amount,
    currency: b.currency,
    paymentDate: b.payment_date,
    status: b.status as FinanceStatus,
    clientId: b.client_id,
    caseId: b.case_id,
    description: b.description,
    createdAt: b.created_at,
  };
}

export const financeApi = {
  async list(): Promise<FinanceRecord[]> {
    return (await req<BFinance[]>("GET", "/finance-records")).map(toFinance);
  },

  async create(
    f: Pick<FinanceRecord, "recordType" | "amount" | "currency" | "paymentDate" | "clientId" | "caseId" | "description">
  ): Promise<FinanceRecord> {
    return toFinance(
      await req<BFinance>("POST", "/finance-records", {
        record_type: f.recordType,
        amount: f.amount,
        currency: f.currency,
        payment_date: f.paymentDate,
        client_id: f.clientId || null,
        case_id: f.caseId || null,
        description: f.description || null,
      })
    );
  },
};

// ── Leads API ─────────────────────────────────────────────────────────────────

export type LeadStatus = "new" | "contacted" | "converted" | "rejected";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source: string | null;
  consent_personal_data: boolean;
  status: LeadStatus;
  sheets_appended_at: string | null;
  telegram_sent_at: string | null;
  last_integration_error: string | null;
  created_at: string;
}

export interface LeadRetryResult {
  id: string;
  integrations: { sheets: string; telegram: string };
}

export const leadsApi = {
  async list(status?: LeadStatus): Promise<Lead[]> {
    const path = status ? `/leads?status=${encodeURIComponent(status)}` : "/leads";
    return req<Lead[]>("GET", path);
  },

  async updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    return req<Lead>("PATCH", `/leads/${id}`, { status });
  },

  async retry(id: string): Promise<LeadRetryResult> {
    return req<LeadRetryResult>("POST", `/leads/${id}/integrations/retry`);
  },

  async remove(id: string): Promise<void> {
    try {
      await req<void>("DELETE", `/leads/${id}`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 405 || e.status === 501)) {
        await req<void>("POST", `/leads/${id}/delete`);
        return;
      }
      throw e;
    }
  },
};
