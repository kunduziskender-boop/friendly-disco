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

const BASE = "http://localhost:8000";

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

async function req<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_token) headers.Authorization = `Bearer ${_token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    let msg: string;
    if (Array.isArray(data?.detail)) {
      msg = (data.detail as { msg: string }[]).map((d) => d.msg).join("; ");
    } else {
      msg =
        (data?.detail as { message?: string } | null)?.message ??
        String(data?.detail ?? `Ошибка ${res.status}`);
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
