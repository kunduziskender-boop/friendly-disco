// Вспомогательные страницы: Календарь, Задачи, Документы, Финансы, Настройки
import { useState } from 'react'
import { events, tasks, documents, finances } from '../data/mock'
import { EmptyState } from '../components/EmptyState'

// ─────────────────────────────────────────────────────────────────────────────
// ПЕРЕИСПОЛЬЗУЕМЫЕ БЕЙДЖИ
// ─────────────────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  const map = {
    high:   { label: 'Высокий', cls: 'bg-red-100 text-red-600' },
    medium: { label: 'Средний', cls: 'bg-amber-100 text-amber-600' },
    low:    { label: 'Низкий',  cls: 'bg-green-100 text-green-600' },
  }
  const s = map[priority] ?? { label: priority, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
}

function PaymentBadge({ status }) {
  const map = {
    paid:    { label: 'Оплачено',  cls: 'bg-green-100 text-green-700' },
    pending: { label: 'Ожидает',   cls: 'bg-amber-100 text-amber-700' },
    overdue: { label: 'Просрочено',cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
}

function DocTypeBadge({ type }) {
  const map = {
    document: { label: 'Документ', cls: 'bg-blue-100 text-blue-700',   icon: '📄' },
    template: { label: 'Шаблон',   cls: 'bg-purple-100 text-purple-700', icon: '📋' },
    contract: { label: 'Договор',  cls: 'bg-amber-100 text-amber-700', icon: '📑' },
  }
  const s = map[type] ?? { label: type, cls: 'bg-gray-100 text-gray-600', icon: '📁' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  )
}

function EventTypeBadge({ type }) {
  const map = {
    hearing:      { label: 'Заседание',    cls: 'bg-red-100 text-red-700' },
    meeting:      { label: 'Встреча',      cls: 'bg-blue-100 text-blue-700' },
    consultation: { label: 'Консультация', cls: 'bg-green-100 text-green-700' },
  }
  const s = map[type] ?? { label: type, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Календарь  /calendar
// ─────────────────────────────────────────────────────────────────────────────

// Строит массив ячеек для сетки месяца (null = пустая ячейка до начала месяца)
function buildCalendarGrid(year, month) {
  const firstDow    = new Date(year, month, 1).getDay() // 0=вс
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset      = firstDow === 0 ? 6 : firstDow - 1  // приводим к пн=0
  const cells = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

const MONTH_NAMES = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]

export function CalendarPage() {
  // Показываем июнь 2024 — там все демо-данные
  const year  = 2024
  const month = 5  // 5 = июнь (0-based)
  const cells = buildCalendarGrid(year, month)

  // Группируем события по числу месяца
  const eventsByDay = {}
  events.forEach((ev) => {
    const d = new Date(ev.date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!eventsByDay[day]) eventsByDay[day] = []
      eventsByDay[day].push(ev)
    }
  })

  const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Календарь</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
          + Добавить событие
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Сетка месяца */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{MONTH_NAMES[month]} {year}</h2>
            <div className="flex gap-1">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">←</button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">→</button>
            </div>
          </div>

          {/* Подписи дней недели */}
          <div className="grid grid-cols-7 mb-1">
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d) => (
              <p key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</p>
            ))}
          </div>

          {/* Ячейки */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {cells.map((day, i) => {
              const dayEvts = day ? (eventsByDay[day] ?? []) : []
              return (
                <div
                  key={i}
                  className={`rounded-lg min-h-[44px] sm:min-h-[64px] p-1 ${day ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                >
                  {day && (
                    <>
                      <p className={`text-xs font-semibold text-center w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full mx-auto mb-1 ${
                        dayEvts.length > 0 ? 'bg-blue-600 text-white' : 'text-gray-600'
                      }`}>
                        {day}
                      </p>

                      {/* На мобильном — цветные точки; на sm+ — метки времени */}
                      <div className="sm:hidden flex gap-0.5 flex-wrap justify-center">
                        {dayEvts.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              ev.type === 'hearing' ? 'bg-red-400' : 'bg-blue-400'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="hidden sm:block">
                        {dayEvts.slice(0, 2).map((ev) => (
                          <p
                            key={ev.id}
                            className={`text-xs truncate rounded px-1 py-0.5 mb-0.5 leading-tight ${
                              ev.type === 'hearing' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {ev.time}
                          </p>
                        ))}
                        {dayEvts.length > 2 && (
                          <p className="text-xs text-gray-400 text-center">+{dayEvts.length - 2}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Легенда */}
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Заседание</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Встреча</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> Консультация</span>
          </div>
        </div>

        {/* Список всех событий */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Все события</h2>
          <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
            {sortedEvents.length > 0 ? sortedEvents.map((ev) => {
              const d = new Date(ev.date)
              return (
                <div key={ev.id} className="flex gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                  {/* Дата-плитка */}
                  <div className="flex-shrink-0 w-11 text-center bg-blue-50 rounded-lg py-1.5">
                    <p className="text-sm font-bold text-blue-700 leading-none">{d.getDate()}</p>
                    <p className="text-xs text-blue-400 mt-0.5">
                      {d.toLocaleDateString('ru-RU', { month: 'short' })}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ev.time}</p>
                    <EventTypeBadge type={ev.type} />
                  </div>
                </div>
              )
            }) : (
              <EmptyState
                icon="📅"
                title="Нет событий"
                description="Добавьте заседание, встречу или консультацию"
                actionLabel="+ Добавить событие"
                onAction={() => {}}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Задачи  /tasks
// ─────────────────────────────────────────────────────────────────────────────
export function TasksPage() {
  const [filter, setFilter]     = useState('active')  // 'all' | 'active' | 'done'
  const [taskList, setTaskList] = useState(tasks)

  const filtered = taskList.filter((t) => {
    if (filter === 'active') return !t.done
    if (filter === 'done')   return t.done
    return true
  })

  const toggle = (id) =>
    setTaskList((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  const active = taskList.filter((t) => !t.done)
  const high   = active.filter((t) => t.priority === 'high')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Задачи и сроки</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
          + Добавить задачу
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{active.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Активных</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{high.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Срочных</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{taskList.filter((t) => t.done).length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Выполнено</p>
        </div>
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 flex gap-2">
        {[
          { id: 'all',    label: 'Все' },
          { id: 'active', label: 'Активные' },
          { id: 'done',   label: 'Выполненные' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Список задач */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {filtered.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors ${t.done ? 'opacity-60' : ''}`}
          >
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => toggle(t.id)}
              className="mt-0.5 w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {t.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.description}</p>
              {t.case && (
                <p className="text-xs text-blue-500 mt-1 font-mono">📋 {t.case}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <PriorityBadge priority={t.priority} />
              <p className={`text-xs ${t.done ? 'text-gray-300' : 'text-gray-500'}`}>до {t.deadline}</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          filter === 'done'
            ? <EmptyState
                icon="📋"
                title="Нет выполненных задач"
                description="Завершите задачу — и она появится здесь"
              />
            : filter === 'active'
              ? <EmptyState
                  icon="✅"
                  title="Нет активных задач"
                  description="Все задачи выполнены — отличная работа!"
                />
              : <EmptyState
                  icon="📋"
                  title="Нет задач"
                  description="Добавьте первую задачу или процессуальный срок"
                  actionLabel="+ Добавить задачу"
                  onAction={() => {}}
                />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Документы  /documents
// ─────────────────────────────────────────────────────────────────────────────
export function DocumentsPage() {
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch]         = useState('')

  const filtered = documents.filter((d) => {
    const matchType   = typeFilter === 'all' || d.type === typeFilter
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const counts = {
    total:     documents.length,
    documents: documents.filter((d) => d.type === 'document').length,
    templates: documents.filter((d) => d.type === 'template').length,
    contracts: documents.filter((d) => d.type === 'contract').length,
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Документы</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
          + Загрузить файл
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Всего файлов',  value: counts.total,     color: 'text-gray-900' },
          { label: 'Документов',    value: counts.documents,  color: 'text-blue-600' },
          { label: 'Шаблонов',      value: counts.templates,  color: 'text-purple-600' },
          { label: 'Договоров',     value: counts.contracts,  color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Поиск + фильтр */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all',      label: 'Все' },
            { id: 'document', label: 'Документы' },
            { id: 'template', label: 'Шаблоны' },
            { id: 'contract', label: 'Договоры' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список документов */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {filtered.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <span className="text-2xl flex-shrink-0">
              {d.type === 'template' ? '📋' : d.type === 'contract' ? '📑' : '📄'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{d.name}</p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {d.case && <span className="text-xs text-blue-500 font-mono">{d.case}</span>}
                <span className="text-xs text-gray-400">{d.author}</span>
                <span className="text-xs text-gray-400">{d.created}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <DocTypeBadge type={d.type} />
              <span className="text-xs text-gray-400 hidden sm:inline">{d.size}</span>
              <button className="text-xs text-blue-600 hover:underline">Скачать</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          search || typeFilter !== 'all'
            ? <EmptyState
                icon="🔍"
                title="Документы не найдены"
                description="Попробуйте изменить поиск или сбросить фильтр"
                actionLabel="Сбросить фильтры"
                onAction={() => { setSearch(''); setTypeFilter('all') }}
              />
            : <EmptyState
                icon="📁"
                title="Нет документов"
                description="Загрузите документы или создайте шаблон"
                actionLabel="+ Загрузить файл"
                onAction={() => {}}
              />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Финансы  /finance
// ─────────────────────────────────────────────────────────────────────────────
export function FinancePage() {
  const paid    = finances.filter((f) => f.status === 'paid')
  const pending = finances.filter((f) => f.status === 'pending')
  const overdue = finances.filter((f) => f.status === 'overdue')

  const sum = (arr) => arr.reduce((s, f) => s + f.amount, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Финансы</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
          + Выставить счёт
        </button>
      </div>

      {/* Финансовые показатели — 3 колонки уже с sm, не ждём md */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Получено</p>
          <p className="text-3xl font-bold text-green-600">{sum(paid).toLocaleString('ru-RU')} ₽</p>
          <p className="text-xs text-gray-400 mt-1">{paid.length} оплаченных счёта</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Ожидает оплаты</p>
          <p className="text-3xl font-bold text-amber-500">{sum(pending).toLocaleString('ru-RU')} ₽</p>
          <p className="text-xs text-gray-400 mt-1">{pending.length} счёт в ожидании</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Просрочено</p>
          <p className="text-3xl font-bold text-red-500">{sum(overdue).toLocaleString('ru-RU')} ₽</p>
          <p className="text-xs text-gray-400 mt-1">{overdue.length} счёт просрочен</p>
        </div>
      </div>

      {/* Таблица счетов */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Все счета</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Клиент / Дело</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Описание</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Дата</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Сумма</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {finances.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-medium text-gray-800">{f.client}</p>
                  {f.case && <p className="text-xs text-gray-400 font-mono">{f.case}</p>}
                </td>
                <td className="px-5 py-3.5 hidden md:table-cell">
                  <p className="text-sm text-gray-600 truncate max-w-xs">{f.description}</p>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500 hidden sm:table-cell">{f.date}</td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-sm font-bold text-gray-800">{f.amount.toLocaleString('ru-RU')} ₽</span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <PaymentBadge status={f.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {finances.length === 0 && (
          <EmptyState
            icon="💰"
            title="Нет счетов"
            description="Выставьте первый счёт клиенту"
            actionLabel="+ Выставить счёт"
            onAction={() => {}}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦА: Настройки  /settings
// ─────────────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const [form, setForm] = useState({
    name:              'Козлов Алексей Владимирович',
    email:             'kozlov@advokat.ru',
    phone:             '+7 (495) 555-12-34',
    barNumber:         'МО-1234',
    lawFirm:           'Адвокатский кабинет №77',
    notifyHearing:     true,
    notifyEmail:       true,
    notifySms:         false,
  })

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // Переключатель-тогл
  const Toggle = ({ field }) => (
    <button
      onClick={() => set(field, !form[field])}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors flex-shrink-0 ${
        form[field] ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        form[field] ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Настройки</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Профиль */}
        <div className="lg:col-span-2 space-y-5">

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-5">Профиль адвоката</h2>

            {/* Аватар */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                АК
              </div>
              <div>
                <button className="text-sm text-blue-600 hover:underline">Сменить фото</button>
                <p className="text-xs text-gray-400 mt-0.5">JPG или PNG, до 5 МБ</p>
              </div>
            </div>

            {/* Поля формы */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'name',      label: 'ФИО',                       wide: true },
                { key: 'email',     label: 'Email',                     type: 'email' },
                { key: 'phone',     label: 'Телефон',                   type: 'tel' },
                { key: 'barNumber', label: 'Номер адвокатского удостоверения' },
                { key: 'lawFirm',   label: 'Адвокатское образование',   wide: true },
              ].map((f) => (
                <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}</label>
                  <input
                    type={f.type ?? 'text'}
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <button className="mt-5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
              Сохранить изменения
            </button>
          </div>

          {/* Уведомления */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Уведомления</h2>
            <div className="space-y-4">
              {[
                { key: 'notifyHearing', label: 'Напоминания о заседаниях',   desc: 'За 24 ч и за 2 ч до заседания' },
                { key: 'notifyEmail',   label: 'Email-уведомления',           desc: 'Отправлять напоминания на email' },
                { key: 'notifySms',     label: 'SMS-уведомления',             desc: 'Отправлять SMS на указанный номер' },
              ].map((n) => (
                <div key={n.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{n.label}</p>
                    <p className="text-xs text-gray-400">{n.desc}</p>
                  </div>
                  <Toggle field={n.key} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Правая колонка */}
        <div className="space-y-4">

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Безопасность</h3>
            <div className="space-y-1">
              {[
                { icon: '🔐', label: 'Сменить пароль' },
                { icon: '📱', label: 'Двухфакторная аутентификация' },
                { icon: '🖥',  label: 'Активные сессии' },
              ].map((a) => (
                <button key={a.label} className="w-full text-left flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Данные</h3>
            <div className="space-y-1">
              <button className="w-full text-left flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                <span>📤</span> Экспорт данных (CSV)
              </button>
              <button className="w-full text-left flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                <span>📥</span> Импорт данных
              </button>
              <button className="w-full text-left flex items-center gap-2 text-sm text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                <span>🗑</span> Удалить аккаунт
              </button>
            </div>
          </div>

          {/* Информация о версии */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white">
            <p className="font-bold">ЮрCRM v1.0</p>
            <p className="text-blue-200 text-xs mt-1">Frontend Demo Build</p>
            <p className="text-blue-200 text-xs mt-3 leading-relaxed">
              React 18 + Tailwind CSS<br />
              Без бэкенда (мок-данные)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
