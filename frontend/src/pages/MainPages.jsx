// Основные страницы CRM: Дашборд, Клиенты, Карточка клиента, Дела, Карточка дела
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clients, cases, tasks, events } from '../data/mock'
import { EmptyState } from '../components/EmptyState'

// ─────────────────────────────────────────────────────────────────────────────
// ОБЩИЕ КОМПОНЕНТЫ (используются на нескольких страницах)
// ─────────────────────────────────────────────────────────────────────────────

// Цветной бейдж статуса дела
function CaseBadge({ status }) {
  const map = {
    new:         { label: 'Новое',     cls: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'В работе',  cls: 'bg-amber-100 text-amber-700' },
    court:       { label: 'В суде',    cls: 'bg-purple-100 text-purple-700' },
    closed:      { label: 'Завершено', cls: 'bg-green-100 text-green-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}

// Бейдж статуса клиента (активный / неактивный)
function ClientBadge({ status }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {status === 'active' ? 'Активный' : 'Неактивный'}
    </span>
  )
}

// Карточка с числовой статистикой для дашборда
function StatCard({ label, value, icon, colorCls }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className={`inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-lg sm:text-xl mb-2 sm:mb-3 ${colorCls}`}>
        {icon}
      </div>
      {/* Число чуть меньше на мобильном чтобы уместить в 2-колоночной сетке */}
      <p className="text-2xl sm:text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-xs sm:text-sm text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Дашборд  /
// ─────────────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const activeCases   = cases.filter((c) => c.status !== 'closed')
  const pendingTasks  = tasks.filter((t) => !t.done)
  const upcomingEvts  = [...events]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Дашборд</h1>

      {/* Блок статистики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Клиентов"              value={clients.length}    icon="👥" colorCls="bg-blue-50 text-blue-600" />
        <StatCard label="Активных дел"          value={activeCases.length} icon="⚖️" colorCls="bg-purple-50 text-purple-600" />
        <StatCard label="Заседаний на неделе"   value={3}                 icon="📅" colorCls="bg-amber-50 text-amber-600" />
        <StatCard label="Срочных задач"         value={pendingTasks.filter(t => t.priority === 'high').length} icon="⚠️" colorCls="bg-red-50 text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Активные дела */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Активные дела</h2>
            <Link to="/cases" className="text-sm text-blue-600 hover:underline">Все дела →</Link>
          </div>
          <div className="space-y-1">
            {activeCases.length > 0 ? activeCases.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to={`/cases/${c.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800 font-mono">{c.number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.client}</p>
                </div>
                <CaseBadge status={c.status} />
              </Link>
            )) : (
              <EmptyState icon="⚖️" title="Нет активных дел" description="Все дела завершены" />
            )}
          </div>
        </div>

        {/* Ближайшие события */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Ближайшие события</h2>
            <Link to="/calendar" className="text-sm text-blue-600 hover:underline">Календарь →</Link>
          </div>
          <div className="space-y-2">
            {upcomingEvts.length > 0 ? upcomingEvts.map((ev) => {
              const d = new Date(ev.date)
              return (
                <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50">
                  <div className="flex-shrink-0 w-11 text-center bg-blue-50 rounded-lg py-1.5">
                    <p className="text-sm font-bold text-blue-700 leading-none">
                      {d.getDate()}
                    </p>
                    <p className="text-xs text-blue-400 mt-0.5">
                      {d.toLocaleDateString('ru-RU', { month: 'short' })}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ev.time} · {ev.location}</p>
                  </div>
                </div>
              )
            }) : (
              <EmptyState icon="📅" title="Нет предстоящих событий" description="Добавьте заседание или встречу в календарь" />
            )}
          </div>
        </div>

        {/* Срочные задачи */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Срочные задачи</h2>
            <Link to="/tasks" className="text-sm text-blue-600 hover:underline">Все задачи →</Link>
          </div>
          {pendingTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pendingTasks.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                    t.priority === 'high'   ? 'bg-red-500' :
                    t.priority === 'medium' ? 'bg-amber-400' : 'bg-green-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">до {t.deadline}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="✅" title="Все задачи выполнены" description="Нет активных задач — отличная работа!" />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Список клиентов  /clients
// ─────────────────────────────────────────────────────────────────────────────
export function ClientsPage() {
  const [search, setSearch] = useState('')

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* flex-wrap: кнопка переносится на следующую строку если не вмещается */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Клиенты</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
          + Добавить клиента
        </button>
      </div>

      {/* Строка поиска */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Клиент</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Контакт</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Дел</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Оплачено</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link to={`/clients/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.type === 'physical' ? 'Физ. лицо' : 'Юр. лицо'} · с {c.created}
                  </p>
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <p className="text-sm text-gray-700">{c.phone}</p>
                  <p className="text-xs text-gray-400">{c.email}</p>
                </td>
                <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                  <span className="text-sm font-semibold text-gray-700">{c.casesCount}</span>
                </td>
                <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                  <span className="text-sm text-gray-700">{c.totalPaid.toLocaleString('ru-RU')} ₽</span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <ClientBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          search
            ? <EmptyState
                icon="🔍"
                title="Клиенты не найдены"
                description={`По запросу «${search}» ничего не найдено. Проверьте написание.`}
                actionLabel="Сбросить поиск"
                onAction={() => setSearch('')}
              />
            : <EmptyState
                icon="👥"
                title="Нет клиентов"
                description="Добавьте первого клиента, чтобы начать вести дела"
                actionLabel="+ Добавить клиента"
                onAction={() => {}}
              />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Карточка клиента  /clients/:id
// ─────────────────────────────────────────────────────────────────────────────
export function ClientDetailPage() {
  const { id } = useParams()
  const client = clients.find((c) => c.id === Number(id))
  const clientCases = cases.filter((c) => c.clientId === Number(id))

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-lg">Клиент не найден</p>
        <Link to="/clients" className="text-blue-600 hover:underline text-sm mt-3 inline-block">
          ← Вернуться к списку
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Хлебные крошки */}
      <nav className="flex items-center gap-2 text-sm mb-6 text-gray-400">
        <Link to="/clients" className="hover:text-gray-600">Клиенты</Link>
        <span>/</span>
        <span className="text-gray-700">{client.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Карточка с данными клиента */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
              {client.name[0]}
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-snug">{client.name}</h1>
              <p className="text-sm text-gray-500">
                {client.type === 'physical' ? 'Физическое лицо' : 'Юридическое лицо'}
              </p>
              <ClientBadge status={client.status} />
            </div>
          </div>

          {/* Контактная информация */}
          <ul className="space-y-2.5 text-sm mb-6">
            {[
              { icon: '📞', text: client.phone },
              { icon: '✉️', text: client.email },
              { icon: '📍', text: client.address },
              { icon: '📅', text: `Клиент с ${client.created}` },
            ].map((row) => (
              <li key={row.icon} className="flex gap-2.5 items-start">
                <span className="flex-shrink-0 w-5">{row.icon}</span>
                <span className="text-gray-700">{row.text}</span>
              </li>
            ))}
          </ul>

          {/* Числовая статистика */}
          <div className="border-t border-gray-100 pt-5 grid grid-cols-2 gap-4 text-center mb-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">{client.casesCount}</p>
              <p className="text-xs text-gray-500">Дел</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(client.totalPaid / 1000).toFixed(0)}к
              </p>
              <p className="text-xs text-gray-500">Оплачено, ₽</p>
            </div>
          </div>

          {client.notes && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 italic">
              {client.notes}
            </p>
          )}

          <button className="w-full mt-4 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50 transition-colors">
            Редактировать
          </button>
        </div>

        {/* Дела клиента */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-800">Дела клиента</h2>
            <button className="text-sm text-blue-600 hover:underline">+ Новое дело</button>
          </div>

          {clientCases.length > 0 ? (
            <div className="space-y-3">
              {clientCases.map((c) => (
                <Link
                  key={c.id}
                  to={`/cases/${c.id}`}
                  className="flex items-start justify-between p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="min-w-0 mr-4">
                    <p className="font-semibold text-gray-900 font-mono text-sm">{c.number}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{c.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{c.court}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <CaseBadge status={c.status} />
                    {c.nextDate && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        {new Date(c.nextDate).toLocaleDateString('ru-RU')}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="⚖️"
              title="Нет дел"
              description="У этого клиента ещё нет ни одного дела"
              actionLabel="+ Создать дело"
              onAction={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Список дел  /cases  (список + канбан-доска)
// ─────────────────────────────────────────────────────────────────────────────

// Колонки канбан-доски
const KANBAN_COLS = [
  { id: 'new',         label: 'Новые',    accent: 'border-t-blue-500' },
  { id: 'in_progress', label: 'В работе', accent: 'border-t-amber-500' },
  { id: 'court',       label: 'В суде',   accent: 'border-t-purple-500' },
  { id: 'closed',      label: 'Завершены',accent: 'border-t-green-500' },
]

export function CasesPage() {
  const [view, setView]     = useState('list')  // 'list' | 'kanban'
  const [search, setSearch] = useState('')

  const filtered = cases.filter((c) =>
    c.number.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.client.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Дела</h1>
        <div className="flex items-center gap-2">
          {/* Переключатель список / канбан — на мобильном только иконки */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setView('list')}
              className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors ${
                view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="sm:hidden">📋</span>
              <span className="hidden sm:inline">📋 Список</span>
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors ${
                view === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="sm:hidden">🗂</span>
              <span className="hidden sm:inline">🗂 Канбан</span>
            </button>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
            <span className="hidden sm:inline">+ Новое дело</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>
      </div>

      {/* Поиск */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <input
          type="text"
          placeholder="Поиск по номеру дела, названию или клиенту..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {view === 'list' ? (
        // ── Табличный вид ────────────────────────────────────────────
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Дело</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Клиент</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Тип</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Статус</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">Заседание</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link to={`/cases/${c.id}`} className="font-semibold text-gray-900 hover:text-blue-600 font-mono text-sm">
                      {c.number}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{c.title}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 hidden md:table-cell">{c.client}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 hidden lg:table-cell">{c.type}</td>
                  <td className="px-5 py-3.5 text-center">
                    <CaseBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 hidden xl:table-cell">
                    {c.nextDate ? new Date(c.nextDate).toLocaleDateString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            search
              ? <EmptyState
                  icon="🔍"
                  title="Дела не найдены"
                  description={`По запросу «${search}» ничего не найдено`}
                  actionLabel="Сбросить поиск"
                  onAction={() => setSearch('')}
                />
              : <EmptyState
                  icon="⚖️"
                  title="Нет дел"
                  description="Создайте первое дело для клиента"
                  actionLabel="+ Новое дело"
                  onAction={() => {}}
                />
          )}
        </div>
      ) : (
        // ── Канбан-доска ─────────────────────────────────────────────
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLS.map((col) => {
            const colCases = filtered.filter((c) => c.status === col.id)
            return (
              <div key={col.id} className="flex-shrink-0 w-72">
                <div className={`bg-white rounded-xl border border-gray-100 border-t-4 ${col.accent} shadow-sm overflow-hidden`}>
                  {/* Заголовок колонки */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-700 text-sm">{col.label}</span>
                    <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                      {colCases.length}
                    </span>
                  </div>
                  {/* Карточки дел */}
                  <div className="p-3 space-y-2 min-h-[80px]">
                    {colCases.map((c) => (
                      <Link
                        key={c.id}
                        to={`/cases/${c.id}`}
                        className="block bg-gray-50 rounded-xl p-3 hover:bg-blue-50 hover:border-blue-200 border border-gray-100 transition-colors"
                      >
                        <p className="text-xs font-bold text-gray-400 font-mono">{c.number}</p>
                        <p className="text-sm font-medium text-gray-800 mt-1 leading-snug line-clamp-2">
                          {c.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{c.client}</p>
                        {c.nextDate && (
                          <p className="text-xs text-blue-500 mt-1">
                            📅 {new Date(c.nextDate).toLocaleDateString('ru-RU')}
                          </p>
                        )}
                      </Link>
                    ))}
                    {colCases.length === 0 && (
                      <div className="py-6 text-center">
                        <p className="text-2xl opacity-30">⚖️</p>
                        <p className="text-xs text-gray-300 mt-1">Нет дел</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Карточка дела  /cases/:id
// ─────────────────────────────────────────────────────────────────────────────
export function CaseDetailPage() {
  const { id } = useParams()
  const caseItem  = cases.find((c) => c.id === Number(id))
  const caseTasks = tasks.filter((t) => t.caseId === Number(id))

  if (!caseItem) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-lg">Дело не найдено</p>
        <Link to="/cases" className="text-blue-600 hover:underline text-sm mt-3 inline-block">
          ← Вернуться к делам
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Хлебные крошки */}
      <nav className="flex items-center gap-2 text-sm mb-6 text-gray-400">
        <Link to="/cases" className="hover:text-gray-600">Дела</Link>
        <span>/</span>
        <span className="text-gray-700 font-mono">{caseItem.number}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Основная информация о деле */}
        <div className="lg:col-span-2 space-y-5">

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-mono text-gray-400 mb-1">{caseItem.number}</p>
                <h1 className="text-xl font-bold text-gray-900">{caseItem.title}</h1>
              </div>
              <CaseBadge status={caseItem.status} />
            </div>

            <p className="text-sm text-gray-600 leading-relaxed">{caseItem.description}</p>

            {/* Детали дела */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-100">
              {[
                { label: 'Суд',              value: caseItem.court },
                { label: 'Судья',            value: caseItem.judge ?? '—' },
                { label: 'Тип дела',         value: caseItem.type },
                { label: 'Сумма спора',      value: caseItem.amount ? `${caseItem.amount.toLocaleString('ru-RU')} ₽` : '—' },
                { label: 'Дата открытия',    value: caseItem.opened },
                { label: 'След. заседание',  value: caseItem.nextDate ? new Date(caseItem.nextDate).toLocaleDateString('ru-RU') : '—' },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">{row.label}</p>
                  <p className="text-sm text-gray-800 mt-1">{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Задачи по делу */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Задачи по делу</h2>
              <button className="text-sm text-blue-600 hover:underline">+ Добавить</button>
            </div>

            {caseTasks.length > 0 ? (
              <div className="space-y-2">
                {caseTasks.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-gray-100 ${t.done ? 'opacity-50' : ''}`}
                  >
                    <input type="checkbox" defaultChecked={t.done} readOnly className="rounded w-4 h-4 accent-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {t.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Срок: {t.deadline}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${
                      t.priority === 'high'   ? 'bg-red-100 text-red-600' :
                      t.priority === 'medium' ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {t.priority === 'high' ? 'Высокий' : t.priority === 'medium' ? 'Средний' : 'Низкий'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="✅"
                title="Нет задач по этому делу"
                description="Добавьте задачу или процессуальный срок"
                actionLabel="+ Добавить задачу"
                onAction={() => {}}
              />
            )}
          </div>
        </div>

        {/* Правая панель */}
        <div className="space-y-4">

          {/* Клиент */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Клиент</h3>
            <Link
              to={`/clients/${caseItem.clientId}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 -mx-2 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm flex-shrink-0">
                {caseItem.client[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{caseItem.client}</p>
                <p className="text-xs text-blue-500">Открыть карточку →</p>
              </div>
            </Link>
          </div>

          {/* Быстрые действия */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Действия</h3>
            <div className="space-y-1">
              {[
                { icon: '📄', label: 'Создать документ' },
                { icon: '📅', label: 'Добавить заседание' },
                { icon: '✅', label: 'Добавить задачу' },
              ].map((a) => (
                <button key={a.label} className="w-full text-left flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
              <button className="w-full text-left flex items-center gap-2 text-sm text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                <span>🗂</span> Закрыть дело
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
