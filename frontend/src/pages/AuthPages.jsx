// Публичные страницы: Вход в систему и 404
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Страница входа /login ─────────────────────────────────────────────────────
export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    // Имитация задержки API (в реальности — fetch/axios к /api/auth/login)
    setTimeout(() => navigate('/'), 800)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

        {/* Логотип */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4">
            <span className="text-4xl">⚖️</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ЮрCRM</h1>
          <p className="text-gray-500 text-sm mt-1">CRM-система для адвоката</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kozlov@advokat.ru"
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-gray-600">
              <input type="checkbox" className="rounded accent-blue-600" />
              Запомнить меня
            </label>
            <button type="button" className="text-blue-600 hover:underline">
              Забыли пароль?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-xl transition-colors mt-2"
          >
            {loading ? 'Вход...' : 'Войти в систему'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Демо-версия: введите любой email и пароль
        </p>
      </div>
    </div>
  )
}

// ── Страница 404 /* ────────────────────────────────────────────────────────────
export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-md">
        <p className="text-9xl font-extrabold text-gray-200 select-none leading-none">404</p>
        <div className="mt-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-700">Страница не найдена</h2>
          <p className="text-gray-500 mt-2">
            Запрашиваемый адрес не существует или был перемещён.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            ← Назад
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            На главную
          </button>
        </div>
      </div>
    </div>
  )
}
