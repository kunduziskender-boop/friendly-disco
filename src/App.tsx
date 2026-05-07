import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { auth, login, clientsApi, casesApi, eventsApi, financeApi } from "./api";
import type {
  Appointment,
  Client,
  CaseStatus,
  FinanceRecord,
  FinanceStatus,
  FinanceType,
  LegalCase,
} from "./types";

type Tab = "обзор" | "клиенты" | "дела" | "встречи" | "финансы";

const caseStatuses: CaseStatus[] = ["новое", "в работе", "суд", "закрыто"];

const FINANCE_TYPE_LABEL: Record<FinanceType, string> = {
  payment: "Платёж",
  expense: "Расход",
  refund: "Возврат",
};

const FINANCE_STATUS_LABEL: Record<FinanceStatus, string> = {
  pending: "Ожидается",
  paid: "Оплачено",
  cancelled: "Отменено",
};

// Phone regex must match backend: ^\+?[1-9]\d{6,14}$
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
function validatePhone(raw: string): string | null {
  const v = raw.replace(/\s/g, "");
  if (!v) return null; // empty is OK — api.ts uses a fallback
  return PHONE_RE.test(v) ? null : "Формат: +79991234567 (7–15 цифр, без пробелов)";
}

function clientLabel(clients: Client[], id: string | null): string {
  if (!id) return "—";
  return clients.find((c) => c.id === id)?.name ?? "—";
}

function caseLabel(cases: LegalCase[], id: string | null): string {
  if (!id) return "—";
  return cases.find((c) => c.id === id)?.title ?? "—";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Неизвестная ошибка";
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [loggedIn, setLoggedIn] = useState(auth.hasToken());

  const handleLogout = useCallback(() => {
    auth.clear();
    setLoggedIn(false);
  }, []);

  if (!loggedIn) return <LoginScreen onSuccess={() => setLoggedIn(true)} />;
  return <MainApp onLogout={handleLogout} />;
}

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("lawyer@example.com");
  const [password, setPassword] = useState("Lawyer1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={loginStyle.wrap}>
      <div style={loginStyle.box}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.4rem" }}>CRM адвоката</h1>
        <p style={{ margin: "0 0 1.5rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          Войдите, чтобы продолжить
        </p>
        <label style={form.label}>
          Email
          <input style={form.input} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <label style={{ ...form.label, marginTop: "0.75rem" }}>
          Пароль
          <input style={form.input} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {error && <p style={loginStyle.error}>{error}</p>}
        <button
          type="button"
          style={{ ...btn.primary, marginTop: "1.1rem", width: "100%", opacity: loading ? 0.6 : 1 }}
          onClick={submit} disabled={loading}
        >
          {loading ? "Вход…" : "Войти"}
        </button>
        <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
          lawyer / admin / assistant @example.com
        </p>
      </div>
    </div>
  );
}

const loginStyle = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" } as CSSProperties,
  box: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "2rem 2.25rem", width: "100%", maxWidth: 380 } as CSSProperties,
  error: { marginTop: "0.75rem", padding: "0.6rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--danger)", fontSize: "0.88rem" } as CSSProperties,
};

// ── Shared ────────────────────────────────────────────────────────────────────

function Spinner() {
  return <p style={{ color: "var(--muted)", margin: 0, fontStyle: "italic" }}>Загрузка…</p>;
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ padding: "0.65rem 0.85rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--danger)", fontSize: "0.88rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <span style={{ flex: 1 }}>⚠ {message}</span>
      {onRetry && <button type="button" onClick={onRetry} style={{ ...btn.danger, fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}>Повторить</button>}
    </div>
  );
}

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <span style={{ fontSize: "0.8rem", color: "var(--danger)", marginTop: 2 }}>{msg}</span>;
}

// ── Main app ──────────────────────────────────────────────────────────────────

function MainApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("обзор");

  const [clients, setClients] = useState<Client[]>([]);
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);

  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingFinance, setLoadingFinance] = useState(false);

  const [errorClients, setErrorClients] = useState<string | null>(null);
  const [errorCases, setErrorCases] = useState<string | null>(null);
  const [errorEvents, setErrorEvents] = useState<string | null>(null);
  const [errorFinance, setErrorFinance] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setLoadingClients(true); setErrorClients(null);
    try { setClients(await clientsApi.list()); } catch (e) { setErrorClients(errMsg(e)); } finally { setLoadingClients(false); }
  }, []);

  const loadCases = useCallback(async () => {
    setLoadingCases(true); setErrorCases(null);
    try { setCases(await casesApi.list()); } catch (e) { setErrorCases(errMsg(e)); } finally { setLoadingCases(false); }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true); setErrorEvents(null);
    try { setAppointments(await eventsApi.list()); } catch (e) { setErrorEvents(errMsg(e)); } finally { setLoadingEvents(false); }
  }, []);

  const loadFinance = useCallback(async () => {
    setLoadingFinance(true); setErrorFinance(null);
    try { setFinanceRecords(await financeApi.list()); } catch (e) { setErrorFinance(errMsg(e)); } finally { setLoadingFinance(false); }
  }, []);

  useEffect(() => {
    loadClients(); loadCases(); loadEvents(); loadFinance();
  }, [loadClients, loadCases, loadEvents, loadFinance]);

  const stats = useMemo(() => ({
    clients: clients.length,
    open: cases.filter((c) => c.status !== "закрыто").length,
    soon: appointments.filter((a) => !Number.isNaN(new Date(a.at).getTime()) && new Date(a.at).getTime() >= Date.now()).length,
  }), [clients, cases, appointments]);

  return (
    <div style={layout.app}>
      <header style={layout.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>CRM адвоката</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>Данные сохраняются в базе данных.</p>
        </div>
        <nav style={layout.nav}>
          {(["обзор", "клиенты", "дела", "встречи", "финансы"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ ...layout.navBtn, ...(tab === t ? layout.navBtnActive : {}) }}>
              {t}
            </button>
          ))}
          <button type="button" onClick={onLogout} style={layout.navBtnLogout}>Выйти</button>
        </nav>
      </header>

      <main style={layout.main}>
        {tab === "обзор" && <Overview stats={stats} appointments={appointments} clients={clients} />}
        {tab === "клиенты" && (
          <ClientsTab clients={clients} cases={cases} appointments={appointments} financeRecords={financeRecords}
            loading={loadingClients} error={errorClients} onRefresh={loadClients}
            onAdd={async (c) => { await clientsApi.create(c); await loadClients(); }}
            onRemove={async (id) => { await clientsApi.remove(id); await loadClients(); }} />
        )}
        {tab === "дела" && (
          <CasesTab cases={cases} clients={clients} loading={loadingCases} error={errorCases} onRefresh={loadCases}
            onAdd={async (c) => { await casesApi.create(c); await loadCases(); }}
            onStatusChange={async (id, status) => { await casesApi.updateStatus(id, status); await loadCases(); }} />
        )}
        {tab === "встречи" && (
          <AppointmentsTab appointments={appointments} clients={clients} loading={loadingEvents} error={errorEvents} onRefresh={loadEvents}
            onAdd={async (a) => { await eventsApi.create(a); await loadEvents(); }} />
        )}
        {tab === "финансы" && (
          <FinanceTab records={financeRecords} clients={clients} cases={cases}
            loading={loadingFinance} error={errorFinance} onRefresh={loadFinance}
            onAdd={async (f) => { await financeApi.create(f); await loadFinance(); }} />
        )}
      </main>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ stats, appointments, clients }: {
  stats: { clients: number; open: number; soon: number };
  appointments: Appointment[];
  clients: Client[];
}) {
  const upcoming = [...appointments]
    .filter((a) => !Number.isNaN(new Date(a.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 5);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div style={card.row}>
        <Stat title="Клиентов" value={stats.clients} />
        <Stat title="Дел не закрыто" value={stats.open} />
        <Stat title="Предстоящих встреч" value={stats.soon} />
      </div>
      <section style={card.section}>
        <h2 style={card.h2}>Ближайшие встречи</h2>
        {upcoming.length === 0
          ? <p style={{ color: "var(--muted)", margin: 0 }}>Пока нет записей.</p>
          : <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {upcoming.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.35rem" }}>
                <strong>{a.title}</strong> — {clientLabel(clients, a.clientId)}<br />
                <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {formatLocal(a.at)}{a.place ? ` · ${a.place}` : ""}
                </span>
              </li>
            ))}
          </ul>
        }
      </section>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div style={card.stat}>
      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{title}</div>
      <div style={{ fontSize: "1.75rem", fontFamily: "Literata, serif" }}>{value}</div>
    </div>
  );
}

// ── Clients tab ───────────────────────────────────────────────────────────────

function ClientsTab({ clients, cases, appointments, financeRecords, loading, error, onRefresh, onAdd, onRemove }: {
  clients: Client[];
  cases: LegalCase[];
  appointments: Appointment[];
  financeRecords: FinanceRecord[];
  loading: boolean; error: string | null; onRefresh: () => void;
  onAdd: (c: Omit<Client, "id" | "createdAt">) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handlePhoneChange = (v: string) => {
    setPhone(v);
    setPhoneError(validatePhone(v));
  };

  const add = async () => {
    const pe = validatePhone(phone);
    if (pe) { setPhoneError(pe); return; }
    if (!name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      await onAdd({ name: name.trim(), phone, email, notes });
      setName(""); setPhone(""); setPhoneError(null); setEmail(""); setNotes("");
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить клиента?")) return;
    try { await onRemove(id); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section style={card.section}>
        <h2 style={card.h2}>Новый клиент</h2>
        <div style={form.grid}>
          <label style={form.label}>
            ФИО
            <input style={form.input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={form.label}>
            Телефон
            <input
              style={{ ...form.input, borderColor: phoneError ? "var(--danger)" : undefined }}
              value={phone} placeholder="+79991234567"
              onChange={(e) => handlePhoneChange(e.target.value)} />
            <FieldError msg={phoneError} />
          </label>
          <label style={form.label}>
            Email
            <input style={form.input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Заметки
            <textarea style={form.textarea} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving || !name.trim() || !!phoneError}>
          {saving ? "Сохранение…" : "Добавить клиента"}
        </button>
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Список</h2>
        {loading && <Spinner />}
        {error && <ErrorBanner message={error} onRetry={onRefresh} />}
        {!loading && !error && clients.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>Клиентов пока нет.</p>}
        {!loading && clients.length > 0 && (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {clients.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                style={{
                  ...card.listItem,
                  cursor: "pointer",
                  borderRadius: 8,
                  padding: "0.75rem 0.6rem",
                  background: selectedId === c.id ? "var(--accent-soft)" : undefined,
                  transition: "background 0.15s",
                }}
              >
                <div>
                  <strong>{c.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {c.notes ? <p style={{ margin: "0.35rem 0 0" }}>{c.notes}</p> : null}
                </div>
                <button
                  type="button"
                  style={btn.danger}
                  onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedId && (() => {
        const client = clients.find((c) => c.id === selectedId);
        if (!client) return null;
        return (
          <ClientDetail
            client={client}
            cases={cases.filter((c) => c.clientId === selectedId)}
            appointments={appointments.filter((a) => a.clientId === selectedId)}
            financeRecords={financeRecords.filter((f) => f.clientId === selectedId)}
            onClose={() => setSelectedId(null)}
          />
        );
      })()}
    </div>
  );
}

// ── Client detail panel ───────────────────────────────────────────────────────

function ClientDetail({ client, cases, appointments, financeRecords, onClose }: {
  client: Client;
  cases: LegalCase[];
  appointments: Appointment[];
  financeRecords: FinanceRecord[];
  onClose: () => void;
}) {
  const balance = financeRecords
    .filter((r) => r.status !== "cancelled")
    .reduce((sum, r) => r.recordType === "expense" ? sum - r.amount : sum + r.amount, 0);

  return (
    <section style={{ ...card.section, borderColor: "var(--accent)", borderWidth: 2 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ margin: "0 0 0.2rem", fontSize: "1.15rem" }}>{client.name}</h2>
          <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            {[client.phone, client.email].filter(Boolean).join(" · ") || "—"}
          </div>
          {client.notes && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{client.notes}</p>}
        </div>
        <button type="button" onClick={onClose}
          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "0.3rem 0.7rem", cursor: "pointer", color: "var(--muted)", fontSize: "1rem" }}>
          ✕
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {/* Cases */}
        <div>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
            Дела ({cases.length})
          </h3>
          {cases.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>Нет дел.</p>
            : cases.map((c) => (
              <div key={c.id} style={{ marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                <span style={casePill[c.status]}>{c.status}</span>{" "}
                <strong>{c.title}</strong>
                {c.nextDeadline && <span style={{ color: "var(--muted)" }}> · до {c.nextDeadline}</span>}
              </div>
            ))
          }
        </div>

        {/* Appointments */}
        <div>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
            Встречи ({appointments.length})
          </h3>
          {appointments.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>Нет встреч.</p>
            : appointments
              .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
              .map((a) => (
                <div key={a.id} style={{ marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  <strong>{a.title}</strong>
                  <div style={{ color: "var(--muted)" }}>
                    {formatLocal(a.at)}{a.place ? ` · ${a.place}` : ""}
                  </div>
                </div>
              ))
          }
        </div>

        {/* Finance */}
        <div>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
            Финансы ({financeRecords.length})
          </h3>
          {financeRecords.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>Нет записей.</p>
            : <>
              {financeRecords
                .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                .map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.35rem" }}>
                    <span>
                      <span style={financePill[r.recordType]}>{FINANCE_TYPE_LABEL[r.recordType]}</span>{" "}
                      {r.description ?? ""}
                    </span>
                    <strong style={{ color: r.recordType === "expense" ? "var(--danger)" : "#065f46" }}>
                      {r.recordType === "expense" ? "−" : "+"}{r.amount.toLocaleString("ru-RU")} {r.currency}
                    </strong>
                  </div>
                ))}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.5rem", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between", fontSize: "0.9rem", fontWeight: 600 }}>
                <span>Итого</span>
                <span style={{ color: balance >= 0 ? "#065f46" : "var(--danger)" }}>
                  {balance >= 0 ? "+" : ""}{balance.toLocaleString("ru-RU")} {financeRecords[0]?.currency ?? "RUB"}
                </span>
              </div>
            </>
          }
        </div>
      </div>
    </section>
  );
}

// ── Cases tab ─────────────────────────────────────────────────────────────────

function CasesTab({ cases, clients, loading, error, onRefresh, onAdd, onStatusChange }: {
  cases: LegalCase[]; clients: Client[];
  loading: boolean; error: string | null; onRefresh: () => void;
  onAdd: (c: Omit<LegalCase, "id">) => Promise<void>;
  onStatusChange: (id: string, status: CaseStatus) => Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [court, setCourt] = useState("");
  const [status, setStatus] = useState<CaseStatus>("новое");
  const [deadline, setDeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const add = async () => {
    if (!clientId || !title.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      await onAdd({ clientId, title: title.trim(), courtOrAuthority: court.trim(), status, nextDeadline: deadline, summary: summary.trim() });
      setTitle(""); setCourt(""); setDeadline(""); setSummary("");
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section style={card.section}>
        <h2 style={card.h2}>Новое дело</h2>
        <div style={form.grid}>
          <label style={form.label}>
            Клиент
            <select style={form.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— выберите —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={form.label}>
            Название / номер дела
            <input style={form.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={form.label}>
            Суд / орган
            <input style={form.input} value={court} onChange={(e) => setCourt(e.target.value)} />
          </label>
          <label style={form.label}>
            Статус
            <select style={form.input} value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)}>
              {caseStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={form.label}>
            След. срок
            <input type="date" style={form.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Кратко по сути
            <textarea style={form.textarea} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving || !clientId || !title.trim()}>
          {saving ? "Сохранение…" : "Добавить дело"}
        </button>
        {!clients.length && <p style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>Сначала добавьте клиента.</p>}
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Дела</h2>
        {loading && <Spinner />}
        {error && <ErrorBanner message={error} onRetry={onRefresh} />}
        {!loading && !error && cases.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>Дел пока нет.</p>}
        {!loading && cases.length > 0 && (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {cases.map((k) => (
              <div key={k.id} style={card.listItem}>
                <div>
                  <strong>{k.title}</strong>{" "}
                  <span style={{ color: "var(--muted)" }}>({clientLabel(clients, k.clientId)})</span>
                  <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    <span style={casePill[k.status]}>{k.status}</span>
                    {k.courtOrAuthority ? ` · ${k.courtOrAuthority}` : ""}
                    {k.nextDeadline ? ` · до ${k.nextDeadline}` : ""}
                  </div>
                  {k.summary ? <p style={{ margin: "0.35rem 0 0" }}>{k.summary}</p> : null}
                </div>
                <select style={{ ...form.input, maxWidth: 140 }} value={k.status}
                  onChange={(e) => onStatusChange(k.id, e.target.value as CaseStatus).catch((e) => alert(errMsg(e)))}>
                  {caseStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Appointments tab ──────────────────────────────────────────────────────────

function AppointmentsTab({ appointments, clients, loading, error, onRefresh, onAdd }: {
  appointments: Appointment[]; clients: Client[];
  loading: boolean; error: string | null; onRefresh: () => void;
  onAdd: (a: Omit<Appointment, "id">) => Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [place, setPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const add = async () => {
    if (!clientId || !title.trim() || !at) return;
    setSaving(true); setSaveError(null);
    try {
      await onAdd({ clientId, title: title.trim(), at, place: place.trim() });
      setTitle(""); setAt(""); setPlace("");
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section style={card.section}>
        <h2 style={card.h2}>Новая встреча</h2>
        <div style={form.grid}>
          <label style={form.label}>
            Клиент
            <select style={form.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— выберите —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={form.label}>
            Тема
            <input style={form.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={form.label}>
            Дата и время
            <input type="datetime-local" style={form.input} value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
          <label style={form.label}>
            Место
            <input style={form.input} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="офис / видео" />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving || !clientId || !title.trim() || !at}>
          {saving ? "Сохранение…" : "Запланировать"}
        </button>
        {!clients.length && <p style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>Сначала добавьте клиента.</p>}
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Календарь</h2>
        {loading && <Spinner />}
        {error && <ErrorBanner message={error} onRetry={onRefresh} />}
        {!loading && !error && appointments.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>Встреч пока нет.</p>}
        {!loading && appointments.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {[...appointments]
              .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
              .map((a) => (
                <li key={a.id} style={{ marginBottom: "0.5rem" }}>
                  <strong>{a.title}</strong> — {clientLabel(clients, a.clientId)}<br />
                  <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {formatLocal(a.at)}{a.place ? ` · ${a.place}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Finance tab ───────────────────────────────────────────────────────────────

function FinanceTab({ records, clients, cases, loading, error, onRefresh, onAdd }: {
  records: FinanceRecord[]; clients: Client[]; cases: LegalCase[];
  loading: boolean; error: string | null; onRefresh: () => void;
  onAdd: (f: Pick<FinanceRecord, "recordType" | "amount" | "currency" | "paymentDate" | "clientId" | "caseId" | "description">) => Promise<void>;
}) {
  const [recordType, setRecordType] = useState<FinanceType>("payment");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("RUB");
  const [paymentDate, setPaymentDate] = useState("");
  const [clientId, setClientId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validateAmount = (v: string) => {
    const n = parseFloat(v);
    if (!v.trim()) return "Введите сумму";
    if (isNaN(n) || n <= 0) return "Сумма должна быть больше 0";
    return null;
  };

  const add = async () => {
    const ae = validateAmount(amount);
    if (ae) { setAmountError(ae); return; }
    if (!paymentDate) return;
    setSaving(true); setSaveError(null);
    try {
      await onAdd({
        recordType,
        amount: parseFloat(amount),
        currency,
        paymentDate,
        clientId: clientId || null,
        caseId: caseId || null,
        description: description.trim() || null,
      });
      setAmount(""); setPaymentDate(""); setClientId(""); setCaseId(""); setDescription(""); setAmountError(null);
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  const total = records.reduce((sum, r) => {
    if (r.status === "cancelled") return sum;
    return r.recordType === "expense" ? sum - r.amount : sum + r.amount;
  }, 0);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section style={card.section}>
        <h2 style={card.h2}>Новая запись</h2>
        <div style={form.grid}>
          <label style={form.label}>
            Тип
            <select style={form.input} value={recordType} onChange={(e) => setRecordType(e.target.value as FinanceType)}>
              <option value="payment">Платёж (доход)</option>
              <option value="expense">Расход</option>
              <option value="refund">Возврат</option>
            </select>
          </label>
          <label style={form.label}>
            Сумма
            <input
              style={{ ...form.input, borderColor: amountError ? "var(--danger)" : undefined }}
              type="number" min="0.01" step="0.01" placeholder="15000"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(validateAmount(e.target.value)); }} />
            <FieldError msg={amountError} />
          </label>
          <label style={form.label}>
            Валюта
            <input style={form.input} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </label>
          <label style={form.label}>
            Дата
            <input type="date" style={form.input} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </label>
          <label style={form.label}>
            Клиент (необязательно)
            <select style={form.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— не указан —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={form.label}>
            Дело (необязательно)
            <select style={form.input} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">— не указано —</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Описание
            <input style={form.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Комментарий к записи" />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving || !amount || !paymentDate || !!amountError}>
          {saving ? "Сохранение…" : "Добавить запись"}
        </button>
      </section>

      <section style={card.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
          <h2 style={{ ...card.h2, margin: 0 }}>Записи</h2>
          <span style={{ fontSize: "0.9rem", color: total >= 0 ? "#065f46" : "var(--danger)", fontWeight: 600 }}>
            Итого: {total >= 0 ? "+" : ""}{total.toLocaleString("ru-RU")} {records[0]?.currency ?? "RUB"}
          </span>
        </div>
        {loading && <Spinner />}
        {error && <ErrorBanner message={error} onRetry={onRefresh} />}
        {!loading && !error && records.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>Записей пока нет.</p>}
        {!loading && records.length > 0 && (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {[...records]
              .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
              .map((r) => (
                <div key={r.id} style={{ ...card.listItem, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" as const }}>
                    <span style={financePill[r.recordType]}>{FINANCE_TYPE_LABEL[r.recordType]}</span>
                    <strong style={{ color: r.recordType === "expense" ? "var(--danger)" : "#065f46" }}>
                      {r.recordType === "expense" ? "−" : "+"}{r.amount.toLocaleString("ru-RU")} {r.currency}
                    </strong>
                    <span style={financeStatusPill[r.status]}>{FINANCE_STATUS_LABEL[r.status]}</span>
                  </div>
                  <div style={{ textAlign: "right" as const, fontSize: "0.88rem", color: "var(--muted)" }}>
                    {r.paymentDate}
                    {r.clientId && <div>{clientLabel(clients, r.clientId)}</div>}
                    {r.caseId && <div>{caseLabel(cases, r.caseId)}</div>}
                    {r.description && <div>{r.description}</div>}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const layout = {
  app: { maxWidth: 960, margin: "0 auto", padding: "1.5rem 1.25rem 2.5rem" } as const,
  header: { display: "flex", flexWrap: "wrap" as const, gap: "1rem", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" },
  nav: { display: "flex", gap: "0.35rem", flexWrap: "wrap" as const },
  navBtn: { border: "1px solid var(--border)", background: "var(--surface)", padding: "0.45rem 0.75rem", borderRadius: "var(--radius)", color: "var(--text)", cursor: "pointer" } as const,
  navBtnActive: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } as const,
  navBtnLogout: { border: "1px solid var(--border)", background: "transparent", padding: "0.45rem 0.75rem", borderRadius: "var(--radius)", color: "var(--muted)", cursor: "pointer", fontSize: "0.88rem" } as const,
  main: {} as const,
};

const card = {
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" } as const,
  section: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.1rem 1.15rem" } as const,
  h2: { margin: "0 0 0.85rem", fontSize: "1.1rem" } as const,
  stat: { background: "var(--accent-soft)", borderRadius: "var(--radius)", padding: "0.85rem 1rem", border: "1px solid var(--border)" } as const,
  listItem: { display: "flex", gap: "0.75rem", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, padding: "0.75rem 0", borderBottom: "1px solid var(--border)" } as const,
};

const form = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.85rem" } as const,
  label: { display: "grid", gap: "0.3rem", fontSize: "0.88rem", color: "var(--muted)" } as const,
  input: { padding: "0.5rem 0.65rem", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" } as const,
  textarea: { padding: "0.5rem 0.65rem", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", resize: "vertical" as const },
};

const btn = {
  primary: { border: "none", background: "var(--accent)", color: "#fff", padding: "0.55rem 1rem", borderRadius: 8, fontWeight: 600, cursor: "pointer" } as const,
  danger: { border: "1px solid #fecaca", background: "#fff", color: "var(--danger)", padding: "0.35rem 0.6rem", borderRadius: 8, fontSize: "0.85rem", cursor: "pointer" } as const,
};

const casePill: Record<CaseStatus, CSSProperties> = {
  новое:      { background: "#ecfdf5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  "в работе": { background: "#eff6ff", color: "#1e40af", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  суд:        { background: "#faf5ff", color: "#6b21a8", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  закрыто:    { background: "#f5f5f4", color: "#57534e", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
};

const financePill: Record<FinanceType, CSSProperties> = {
  payment: { background: "#ecfdf5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  expense: { background: "#fef2f2", color: "#991b1b", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  refund:  { background: "#eff6ff", color: "#1e40af", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
};

const financeStatusPill: Record<FinanceStatus, CSSProperties> = {
  pending:   { background: "#fffbeb", color: "#92400e", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  paid:      { background: "#ecfdf5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  cancelled: { background: "#f5f5f4", color: "#57534e", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
};
