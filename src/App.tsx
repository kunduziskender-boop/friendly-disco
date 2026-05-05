import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { newId } from "./id";
import { defaultState, loadState, saveState } from "./storage";
import type {
  Appointment,
  Client,
  CrmState,
  LegalCase,
  CaseStatus,
} from "./types";

type Tab = "обзор" | "клиенты" | "дела" | "встречи";

const caseStatuses: CaseStatus[] = [
  "новое",
  "в работе",
  "суд",
  "закрыто",
];

function clientLabel(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.name ?? "—";
}

export default function App() {
  const [state, setState] = useState<CrmState>(() => loadState() ?? defaultState());
  const [tab, setTab] = useState<Tab>("обзор");

  useEffect(() => {
    saveState(state);
  }, [state]);

  const update = useCallback((fn: (s: CrmState) => CrmState) => {
    setState(fn);
  }, []);

  const stats = useMemo(() => {
    const open = state.cases.filter((c) => c.status !== "закрыто").length;
    const soon = state.appointments.filter((a) => {
      const t = new Date(a.at).getTime();
      return !Number.isNaN(t) && t >= Date.now();
    }).length;
    return { clients: state.clients.length, open, soon };
  }, [state]);

  return (
    <div style={layout.app}>
      <header style={layout.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>CRM адвоката</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            Клиенты, дела и встречи. Данные хранятся в браузере (демо).
          </p>
        </div>
        <nav style={layout.nav}>
          {(["обзор", "клиенты", "дела", "встречи"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                ...layout.navBtn,
                ...(tab === t ? layout.navBtnActive : {}),
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main style={layout.main}>
        {tab === "обзор" && <Overview stats={stats} state={state} />}
        {tab === "клиенты" && <ClientsTab state={state} update={update} />}
        {tab === "дела" && <CasesTab state={state} update={update} />}
        {tab === "встречи" && <AppointmentsTab state={state} update={update} />}
      </main>
    </div>
  );
}

function Overview({
  stats,
  state,
}: {
  stats: { clients: number; open: number; soon: number };
  state: CrmState;
}) {
  const upcoming = [...state.appointments]
    .filter((a) => {
      const t = new Date(a.at).getTime();
      return !Number.isNaN(t);
    })
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
        {upcoming.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Пока нет записей.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {upcoming.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.35rem" }}>
                <strong>{a.title}</strong> — {clientLabel(state.clients, a.clientId)}
                <br />
                <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {formatLocal(a.at)}
                  {a.place ? ` · ${a.place}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
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

function ClientsTab({
  state,
  update,
}: {
  state: CrmState;
  update: (fn: (s: CrmState) => CrmState) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const add = () => {
    if (!name.trim()) return;
    const c: Client = {
      id: newId(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    update((s) => ({ ...s, clients: [c, ...s.clients] }));
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
  };

  const remove = (id: string) => {
    if (!confirm("Удалить клиента и связанные дела/встречи не будут удалены автоматически. Продолжить?")) return;
    update((s) => ({ ...s, clients: s.clients.filter((x) => x.id !== id) }));
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
            <input style={form.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
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
        <button type="button" style={btn.primary} onClick={add}>
          Добавить клиента
        </button>
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Список</h2>
        {state.clients.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Клиентов пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {state.clients.map((c) => (
              <div key={c.id} style={card.listItem}>
                <div>
                  <strong>{c.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {c.notes ? <p style={{ margin: "0.35rem 0 0" }}>{c.notes}</p> : null}
                </div>
                <button type="button" style={btn.danger} onClick={() => remove(c.id)}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CasesTab({
  state,
  update,
}: {
  state: CrmState;
  update: (fn: (s: CrmState) => CrmState) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [court, setCourt] = useState("");
  const [status, setStatus] = useState<CaseStatus>("новое");
  const [deadline, setDeadline] = useState("");
  const [summary, setSummary] = useState("");

  const add = () => {
    if (!clientId || !title.trim()) return;
    const k: LegalCase = {
      id: newId(),
      clientId,
      title: title.trim(),
      courtOrAuthority: court.trim(),
      status,
      nextDeadline: deadline,
      summary: summary.trim(),
    };
    update((s) => ({ ...s, cases: [k, ...s.cases] }));
    setTitle("");
    setCourt("");
    setDeadline("");
    setSummary("");
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
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
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
              {caseStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={form.label}>
            След. срок (дата)
            <input type="date" style={form.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label style={{ ...form.label, gridColumn: "1 / -1" }}>
            Кратко по сути
            <textarea style={form.textarea} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
        </div>
        <button type="button" style={btn.primary} onClick={add} disabled={!state.clients.length}>
          Добавить дело
        </button>
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Дела</h2>
        {state.cases.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Дел пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {state.cases.map((k) => (
              <div key={k.id} style={card.listItem}>
                <div>
                  <strong>{k.title}</strong>{" "}
                  <span style={{ color: "var(--muted)" }}>({clientLabel(state.clients, k.clientId)})</span>
                  <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    <span style={pill[k.status]}>{k.status}</span>
                    {k.courtOrAuthority ? ` · ${k.courtOrAuthority}` : ""}
                    {k.nextDeadline ? ` · до ${k.nextDeadline}` : ""}
                  </div>
                  {k.summary ? <p style={{ margin: "0.35rem 0 0" }}>{k.summary}</p> : null}
                </div>
                <select
                  style={form.input}
                  value={k.status}
                  onChange={(e) => {
                    const next = e.target.value as CaseStatus;
                    update((s) => ({
                      ...s,
                      cases: s.cases.map((c) => (c.id === k.id ? { ...c, status: next } : c)),
                    }));
                  }}
                >
                  {caseStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentsTab({
  state,
  update,
}: {
  state: CrmState;
  update: (fn: (s: CrmState) => CrmState) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [place, setPlace] = useState("");

  const add = () => {
    if (!clientId || !title.trim() || !at) return;
    const a: Appointment = {
      id: newId(),
      clientId,
      title: title.trim(),
      at,
      place: place.trim(),
    };
    update((s) => ({ ...s, appointments: [a, ...s.appointments] }));
    setTitle("");
    setAt("");
    setPlace("");
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
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
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
        <button type="button" style={btn.primary} onClick={add} disabled={!state.clients.length}>
          Запланировать
        </button>
      </section>

      <section style={card.section}>
        <h2 style={card.h2}>Календарь</h2>
        {state.appointments.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>Встреч пока нет.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {[...state.appointments]
              .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
              .map((a) => (
                <li key={a.id} style={{ marginBottom: "0.5rem" }}>
                  <strong>{a.title}</strong> — {clientLabel(state.clients, a.clientId)}
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                    {formatLocal(a.at)}
                    {a.place ? ` · ${a.place}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatLocal(isoOrLocal: string): string {
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) return isoOrLocal;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

const layout = {
  app: { maxWidth: 960, margin: "0 auto", padding: "1.5rem 1.25rem 2.5rem" } as const,
  header: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "1rem",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: "1.5rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid var(--border)",
  },
  nav: { display: "flex", gap: "0.35rem", flexWrap: "wrap" as const },
  navBtn: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    padding: "0.45rem 0.75rem",
    borderRadius: "var(--radius)",
    color: "var(--text)",
  } as const,
  navBtnActive: {
    background: "var(--accent)",
    color: "#fff",
    borderColor: "var(--accent)",
  } as const,
  main: {} as const,
};

const card = {
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" } as const,
  section: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "1.1rem 1.15rem",
  } as const,
  h2: { margin: "0 0 0.85rem", fontSize: "1.1rem" } as const,
  stat: {
    background: "var(--accent-soft)",
    borderRadius: "var(--radius)",
    padding: "0.85rem 1rem",
    border: "1px solid var(--border)",
  } as const,
  listItem: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
    padding: "0.75rem 0",
    borderBottom: "1px solid var(--border)",
  } as const,
};

const form = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.85rem" } as const,
  label: { display: "grid", gap: "0.3rem", fontSize: "0.88rem", color: "var(--muted)" } as const,
  input: {
    padding: "0.5rem 0.65rem",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "#fff",
  } as const,
  textarea: {
    padding: "0.5rem 0.65rem",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "#fff",
    resize: "vertical" as const,
  },
};

const btn = {
  primary: {
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    padding: "0.55rem 1rem",
    borderRadius: 8,
    fontWeight: 600,
  } as const,
  danger: {
    border: "1px solid #fecaca",
    background: "#fff",
    color: "var(--danger)",
    padding: "0.35rem 0.6rem",
    borderRadius: 8,
    fontSize: "0.85rem",
  } as const,
};

const pill: Record<CaseStatus, CSSProperties> = {
  новое: { background: "#ecfdf5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  "в работе": { background: "#eff6ff", color: "#1e40af", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  суд: { background: "#faf5ff", color: "#6b21a8", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
  закрыто: { background: "#f5f5f4", color: "#57534e", padding: "0.1rem 0.45rem", borderRadius: 6, fontSize: "0.8rem" },
};
