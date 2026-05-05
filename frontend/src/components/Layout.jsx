// Главный лейаут: боковая панель + шапка + контент
// V2: сайдбар на мобильном — фиксированный drawer с затемнением
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/',          label: 'Дашборд',   icon: '🏠', end: true },
  { path: '/clients',   label: 'Клиенты',   icon: '👥' },
  { path: '/cases',     label: 'Дела',      icon: '⚖️' },
  { path: '/calendar',  label: 'Календарь', icon: '📅' },
  { path: '/tasks',     label: 'Задачи',    icon: '✅' },
  { path: '/documents', label: 'Документы', icon: '📄' },
  { path: '/finance',   label: 'Финансы',   icon: '💰' },
  { path: '/settings',  label: 'Настройки', icon: '⚙️' },
]

export default function Layout() {
  // collapsed — только для десктопа: переключает режим «иконки»
  const [collapsed, setCollapsed]   = useState(false)
  // mobileOpen — только для мобильного: показывает/скрывает drawer
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  // Гамбургер ведёт себя по-разному на мобильном и десктопе
  const handleMenuToggle = () => {
    if (window.innerWidth < 768) {
      setMobileOpen((v) => !v)
    } else {
      setCollapsed((v) => !v)
    }
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Затемнение фона за drawer (только мобильный) ────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* ── Боковая панель ────────────────────────────────────────── */}
      {/*
        Мобильный (< md):
          - position: fixed, занимает всю высоту экрана
          - по умолчанию скрыт за экраном (-translate-x-full)
          - при mobileOpen=true — выезжает (translate-x-0)
          - z-30 — поверх контента и затемнения
        Десктоп (≥ md):
          - position: static — участвует в потоке flex-контейнера
          - всегда виден, translate сброшен
          - ширина зависит от collapsed
      */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:inset-auto md:z-auto md:translate-x-0',
          'w-64 flex-shrink-0',
          collapsed ? 'md:w-16' : 'md:w-64',
          'bg-slate-900 text-white flex flex-col transition-all duration-300',
        ].join(' ')}
      >
        {/* Логотип */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700 flex-shrink-0">
          <span className="text-2xl flex-shrink-0">⚖️</span>
          {!collapsed && (
            <div>
              <p className="font-bold text-base leading-tight">ЮрCRM</p>
              <p className="text-slate-400 text-xs">CRM для адвоката</p>
            </div>
          )}
        </div>

        {/* Навигационные ссылки */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              title={collapsed ? item.label : undefined}
              onClick={closeMobile}   // закрыть drawer при переходе на мобильном
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-0.5 transition-colors text-sm font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Профиль внизу */}
        <div className="p-3 border-t border-slate-700 flex-shrink-0">
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
            onClick={() => { navigate('/settings'); closeMobile() }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
              АК
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">Козлов А.В.</p>
                <p className="text-xs text-slate-400 truncate">Адвокат</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Правая часть: шапка + контент ───────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Шапка */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <button
            onClick={handleMenuToggle}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors text-xl leading-none"
            aria-label="Меню"
          >
            ☰
          </button>

          <div className="flex items-center gap-2">
            {/* Уведомления */}
            <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              🔔
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold leading-none">
                3
              </span>
            </button>

            {/* Выход */}
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Выйти
            </button>
          </div>
        </header>

        {/* Прокручиваемый контент — уменьшен padding на мобильном */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
