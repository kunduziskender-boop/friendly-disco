/**
 * API client for Lawyer CRM backend (http://localhost:8000)
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

function computeApiRoot(): string {
  const root = import.meta.env.VITE_API_ROOT?.trim();
  if (root) return root.replace(/\/+$/, "");

  const base = import.meta.env.VITE_API_BASE?.trim();
  if (base) {
    const b = base.replace(/\/+$/, "");
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
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
    let msg = formatHttpError(res.status, data);
    if (res.status === 404) {
      msg += ` (${method} ${url}). Частая причина: старая версия API без префикса /api или без регистрации — перезапустите uvicorn из папки backend актуального кода (нужны POST /api/auth/register и /api/auth/login).`;
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

/** Validates the stored token; clears it and returns false if invalid/expired. */
export async function validateToken(): Promise<boolean> {
  if (!_token) return false;
  try {
    await req("GET", "/auth/me");
    return true;
  } catch {
    auth.clear();
    return false;
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
  court_name: string | null;
  next_hearing_date: string | null;
  opposing_party: string | null;
  case_summary: string | null;
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
    courtOrAuthority: b.court_name ?? "",
    nextDeadline: b.next_hearing_date ?? "",
    summary: b.case_summary ?? "",
    // fs in description preserves "суд" (maps to in_progress on backend)
    status: m.fs ?? FROM_BACKEND[b.status] ?? "новое",
  };
}

interface EventMeta {
  place?: string;
  clientId?: string;
}

function toAppointment(b: BEvent): Appointment {
  const m = parseMeta<EventMeta>(b.description);
  return {
    id: b.id,
    title: b.title,
    clientId: m.clientId ?? b.participants[0] ?? "",
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
    return toCase(
      await req<BCase>("POST", "/cases", {
        case_number: `CASE-${Date.now()}`,
        title: c.title,
        client_id: c.clientId,
        status: TO_BACKEND[c.status],
        court_name: c.courtOrAuthority || null,
        next_hearing_date: c.nextDeadline || null,
        case_summary: c.summary || null,
        description: JSON.stringify({ fs: c.status } satisfies CaseMeta),
      })
    );
  },

  async updateStatus(id: string, status: CaseStatus): Promise<LegalCase> {
    return toCase(
      await req<BCase>("PATCH", `/cases/${id}`, {
        status: TO_BACKEND[status],
        description: JSON.stringify({ fs: status } satisfies CaseMeta),
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
        participants: a.clientId ? [a.clientId] : [],
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
