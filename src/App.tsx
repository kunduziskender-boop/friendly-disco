import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  auth,
  login,
  register,
  clientsApi,
  casesApi,
  eventsApi,
  financeApi,
  fetchMe,
  roleHintRu,
  roleTitleRu,
  AUTH_EXPIRED_EVENT,
  type MeUser,
} from "./api";
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
  if (!v) return null;
  return PHONE_RE.test(v) ? null : "Формат: +79991234567 (7–15 цифр, без пробелов)";
}

const EMAIL_SIMPLE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmailSimple(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "Укажите email.";
  if (!EMAIL_SIMPLE_RE.test(t)) return "Некорректный формат email, например name@company.ru.";
  return null;
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

  useEffect(() => {
    const onSessionLost = () => setLoggedIn(false);
    window.addEventListener(AUTH_EXPIRED_EVENT, onSessionLost);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onSessionLost);
  }, []);

  const handleLogout = useCallback(() => {
    auth.clear();
    setLoggedIn(false);
  }, []);

  if (!loggedIn) return <LoginScreen onSuccess={() => setLoggedIn(true)} />;
  return <MainApp onLogout={handleLogout} />;
}

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    if (next === "login") {
      setFullName("");
    }
  };

  const submit = async () => {
    if (!email.trim()) {
      setError("Укажите email.");
      return;
    }
    if (!password) {
      setError("Укажите пароль.");
      return;
    }
    if (mode === "register" && !fullName.trim()) {
      setError("Укажите ФИО или имя.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError("Пароль не короче 6 символов");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(fullName.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      onSuccess();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "Вход" : "Регистрация";
  const subtitle =
    mode === "login"
      ? "Войдите, чтобы продолжить"
      : "Создайте аккаунт — вам будет назначена роль «помощник»";

  return (
    <div style={loginStyle.wrap}>
      <div style={loginStyle.box}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.4rem" }}>CRM адвоката</h1>
        <p style={{ margin: "0 0 1.5rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          <strong>{title}</strong>
          {" — "}
          {subtitle}
        </p>
        {mode === "register" && (
          <label style={form.label}>
            ФИО / имя
            <input style={form.input} type="text" value={fullName} placeholder="Иванова Мария Сергеевна"
              autoComplete="name"
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </label>
        )}
        <label style={{ ...form.label, marginTop: mode === "register" ? "0.75rem" : 0 }}>
          Email
          <input style={form.input} type="email" value={email} placeholder="you@example.com"
            autoComplete={mode === "register" ? "email" : "username"}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <label style={{ ...form.label, marginTop: "0.75rem" }}>
          Пароль
          <input style={form.input} type="password" value={password}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {error && <p style={loginStyle.error}>{error}</p>}
        <button
          type="button"
          style={{ ...btn.primary, marginTop: "1.1rem", width: "100%", opacity: loading ? 0.6 : 1 }}
          onClick={submit} disabled={loading}
        >
          {loading ? (mode === "login" ? "Вход…" : "Регистрация…") : mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--muted)", textAlign: "center", lineHeight: 1.45 }}>
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button type="button" onClick={() => switchMode("register")}
                style={{ ...btn.link, padding: 0, fontSize: "inherit", display: "inline" }}>
                Регистрация
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <button type="button" onClick={() => switchMode("login")}
                style={{ ...btn.link, padding: 0, fontSize: "inherit", display: "inline" }}>
                Войти
              </button>
            </>
          )}
        </p>
        {mode === "login" && (
          <>
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--muted)", textAlign: "center" }}>
              Самостоятельная регистрация даёт роль «помощник». Демо после чистого seed:{" "}
              <strong>assistant@example.com</strong> / Assist1234, <strong>lawyer@example.com</strong> / Lawyer1234,{" "}
              <strong>admin@example.com</strong> / Admin1234.
            </p>
            <details
              style={{
                marginTop: "0.65rem",
                fontSize: "0.75rem",
                color: "var(--muted)",
                lineHeight: 1.45,
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text)" }}>
                Кто есть кто по ролям
              </summary>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", textAlign: "left" }}>
                <li>
                  <strong>Администратор</strong> — управление пользователями и всем данным CRM без ограничений по строкам.
                </li>
                <li>
                  <strong>Юрист</strong> — полный доступ к клиентам, делам, финансовым записям и задачам (в том числе чужих в рамках конторы).
                </li>
                <li>
                  <strong>Помощник</strong> — ограниченный доступ: в основном свои клиенты и связанные с ними дела и записи (см. правила на бэкенде).
                </li>
              </ul>
              <p style={{ margin: "0.35rem 0 0", textAlign: "center" }}>
                После входа ФИО, email и вашей роли видно в шапке приложения.
              </p>
            </details>
          </>
        )}
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

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={modal.backdrop} onClick={onClose}>
      <div style={modal.box} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

function MainApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("обзор");
  const [me, setMe] = useState<MeUser | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then(
      (user) => {
        if (!cancelled) setMe(user);
      },
      () => {
        if (!cancelled) setMe(null);
      }
    ).finally(() => {
      if (!cancelled) setMeLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          {me ? (
            <div style={{ marginTop: "0.45rem" }}>
              <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.45 }}>
                Вошли как <strong>{me.full_name}</strong>
                {" · "}
                <span
                  title={roleHintRu(me.role)}
                  style={{
                    display: "inline-block",
                    background: "var(--accent-soft)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "0.12rem 0.45rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--accent)",
                  }}
                >
                  {roleTitleRu(me.role)}
                </span>
              </p>
              <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>{me.email}</p>
              <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.78rem", maxWidth: 420, lineHeight: 1.45 }}>
                {roleHintRu(me.role)}
              </p>
            </div>
          ) : !meLoaded ? (
            <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>Загрузка профиля…</p>
          ) : (
            <p style={{ margin: "0.25rem 0 0", color: "var(--danger)", fontSize: "0.88rem" }}>
              Не удалось загрузить профиль. Попробуйте выйти и войти снова.
            </p>
          )}
          <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>Данные сохраняются в базе данных.</p>
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
            onStatusChange={async (id, status) => { await casesApi.updateStatus(id, status); await loadCases(); }}
            onRemove={async (id) => { await casesApi.remove(id); await loadCases(); }} />
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
  const [nameError, setNameError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handlePhoneChange = (v: string) => {
    setPhone(v);
    setPhoneError(validatePhone(v));
    setSaveError(null);
  };

  const add = async () => {
    setSaveError(null);
    setNameError(null);
    setEmailError(null);
    if (!name.trim()) {
      setNameError("Укажите ФИО или название клиента.");
      setSaveError("Укажите ФИО или название клиента.");
      return;
    }
    const pDigits = phone.replace(/\s/g, "");
    if (!pDigits) {
      setPhoneError("Укажите телефон.");
      setSaveError("Укажите телефон.");
      return;
    }
    const pe = validatePhone(phone);
    if (pe) {
      setPhoneError(pe);
      setSaveError(pe);
      return;
    }
    const ee = validateEmailSimple(email);
    if (ee) {
      setEmailError(ee);
      setSaveError(ee);
      return;
    }
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), phone, email, notes });
      setName("");
      setNameError(null);
      setPhone("");
      setPhoneError(null);
      setEmail("");
      setEmailError(null);
      setNotes("");
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить клиента?")) return;
    try {
      await onRemove(id);
      setSelectedId((cur) => (cur === id ? null : cur));
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section style={card.section}>
        <h2 style={card.h2}>Новый клиент</h2>
        <div style={form.grid}>
          <label style={form.label}>
            ФИО
            <input
              style={{ ...form.input, borderColor: nameError ? "var(--danger)" : undefined }}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
                setSaveError(null);
              }}
            />
            <FieldError msg={nameError} />
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
            <input
              style={{ ...form.input, borderColor: emailError ? "var(--danger)" : undefined }}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
                setSaveError(null);
              }}
            />
            <FieldError msg={emailError} />
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Заметки
            <textarea style={form.textarea} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving}>
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
                style={{
                  ...card.listItem,
                  alignItems: "center",
                  borderRadius: 8,
                  padding: "0.75rem 0.6rem",
                  background: selectedId === c.id ? "var(--accent-soft)" : undefined,
                  transition: "background 0.15s",
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(c.id === selectedId ? null : c.id);
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}
                >
                  <strong>{c.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {c.notes ? <p style={{ margin: "0.35rem 0 0" }}>{c.notes}</p> : null}
                </div>
                <button
                  type="button"
                  style={{ ...btn.danger, flexShrink: 0 }}
                  onClick={() => void remove(c.id)}
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
          <Modal onClose={() => setSelectedId(null)}>
            <ClientDetail
              client={client}
              cases={cases.filter((c) => c.clientId === selectedId)}
              appointments={appointments.filter((a) => a.clientId === selectedId)}
              financeRecords={financeRecords.filter((f) => f.clientId === selectedId)}
              onClose={() => setSelectedId(null)}
              onDelete={() => void remove(client.id)}
            />
          </Modal>
        );
      })()}
    </div>
  );
}

// ── Client detail panel ───────────────────────────────────────────────────────

function ClientDetail({ client, cases, appointments, financeRecords, onClose, onDelete }: {
  client: Client;
  cases: LegalCase[];
  appointments: Appointment[];
  financeRecords: FinanceRecord[];
  onClose: () => void;
  onDelete?: () => void;
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
                {c.nextDeadline && <span style={{ color: "var(--muted)" }}> · до {formatDate(c.nextDeadline)}</span>}
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
      {onDelete ? (
        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <button type="button" style={btn.danger} onClick={onDelete}>
            Удалить клиента
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ── Cases tab ─────────────────────────────────────────────────────────────────

function CasesTab({ cases, clients, loading, error, onRefresh, onAdd, onStatusChange, onRemove }: {
  cases: LegalCase[]; clients: Client[];
  loading: boolean; error: string | null; onRefresh: () => void;
  onAdd: (c: Omit<LegalCase, "id">) => Promise<void>;
  onStatusChange: (id: string, status: CaseStatus) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
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
    setSaveError(null);
    if (!clientId) {
      setSaveError("Выберите клиента.");
      return;
    }
    if (!title.trim()) {
      setSaveError("Укажите название или номер дела.");
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        clientId,
        title: title.trim(),
        courtOrAuthority: court.trim(),
        status,
        nextDeadline: parseDateInput(deadline),
        summary: summary.trim(),
      });
      setTitle(""); setCourt(""); setDeadline(""); setSummary("");
    } catch (e) { setSaveError(errMsg(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить это дело? Будут удалены связанные задачи, встречи по делу, документы и финансовые строки.")) return;
    try {
      await onRemove(id);
    } catch (e) {
      alert(errMsg(e));
    }
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
            <input
              style={form.input}
              value={deadline}
              placeholder="ДД.ММ.ГГГГ"
              maxLength={10}
              onChange={(e) => setDeadline(maskDateInput(e.target.value))}
            />
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Кратко по сути
            <textarea style={form.textarea} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving}>
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
              <div key={k.id} style={{ ...card.listItem, alignItems: "center" }}>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <strong>{k.title}</strong>{" "}
                  <span style={{ color: "var(--muted)" }}>({clientLabel(clients, k.clientId)})</span>
                  <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    <span style={casePill[k.status]}>{k.status}</span>
                    {k.courtOrAuthority ? ` · ${k.courtOrAuthority}` : ""}
                    {k.nextDeadline ? ` · до ${formatDate(k.nextDeadline)}` : ""}
                  </div>
                  {k.summary ? <p style={{ margin: "0.35rem 0 0" }}>{k.summary}</p> : null}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                  <select style={{ ...form.input, maxWidth: 140 }} value={k.status}
                    onChange={(e) => onStatusChange(k.id, e.target.value as CaseStatus).catch((e) => alert(errMsg(e)))}>
                    {caseStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" style={btn.danger} onClick={() => void remove(k.id)}>
                    Удалить
                  </button>
                </div>
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
  const [atDate, setAtDate] = useState("");
  const [atTime, setAtTime] = useState("");
  const [place, setPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const add = async () => {
    setSaveError(null);
    if (!clientId) {
      setSaveError("Выберите клиента.");
      return;
    }
    if (!title.trim()) {
      setSaveError("Укажите тему встречи.");
      return;
    }
    const dateISO = parseDateInput(atDate);
    if (!dateISO) {
      setSaveError("Укажите дату в формате ДД.ММ.ГГГГ.");
      return;
    }
    if (atTime.length < 5) {
      setSaveError("Укажите время встречи.");
      return;
    }
    const at = `${dateISO}T${atTime}:00`;
    setSaving(true);
    try {
      await onAdd({ clientId, title: title.trim(), at, place: place.trim() });
      setTitle(""); setAtDate(""); setAtTime(""); setPlace("");
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
            Дата
            <input
              style={form.input}
              value={atDate}
              placeholder="ДД.ММ.ГГГГ"
              maxLength={10}
              onChange={(e) => setAtDate(maskDateInput(e.target.value))}
            />
          </label>
          <label style={form.label}>
            Время
            <input type="time" style={form.input} value={atTime} onChange={(e) => setAtTime(e.target.value)} />
          </label>
          <label style={form.label}>
            Место
            <input style={form.input} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="офис / видео" />
          </label>
        </div>
        {saveError && <ErrorBanner message={saveError} />}
        <button type="button"
          style={{ ...btn.primary, marginTop: "0.75rem", opacity: saving ? 0.6 : 1 }}
          onClick={add} disabled={saving}>
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
    setSaveError(null);
    const ae = validateAmount(amount);
    if (ae) {
      setAmountError(ae);
      setSaveError(ae);
      return;
    }
    const parsedDate = parseDateInput(paymentDate);
    if (!parsedDate) {
      setSaveError("Укажите дату платежа в формате ДД.ММ.ГГГГ.");
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        recordType,
        amount: parseFloat(amount),
        currency,
        paymentDate: parsedDate,
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
            <input
              style={form.input}
              value={paymentDate}
              placeholder="ДД.ММ.ГГГГ"
              maxLength={10}
              onChange={(e) => setPaymentDate(maskDateInput(e.target.value))}
            />
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
          onClick={add} disabled={saving}>
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
                    {formatDate(r.paymentDate)}
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

// ── Helpers ─────────────────────────────────────────────────────────────────--

/** YYYY-MM-DD → DD.MM.YYYY */
function formatDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0].length === 4)
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return iso;
}

/** Автоматически вставляет точки при вводе даты ДД.ММ.ГГГГ */
function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/** DD.MM.YYYY → YYYY-MM-DD для бэкенда, "" если неполная */
function parseDateInput(dmy: string): string {
  const m = dmy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** ISO datetime → локаль DD.MM.YY, время */
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
  link: { border: "none", background: "transparent", color: "var(--accent)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" } as const,
};

const modal = {
  backdrop: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" },
  box: { background: "var(--surface)", borderRadius: "var(--radius)", padding: "1.5rem 1.75rem", maxWidth: 780, width: "100%", maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
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
