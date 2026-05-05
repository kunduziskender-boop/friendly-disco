// Корневой компонент: описывает всю маршрутизацию приложения
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { LoginPage, NotFoundPage } from './pages/AuthPages'
import {
  DashboardPage,
  ClientsPage,
  ClientDetailPage,
  CasesPage,
  CaseDetailPage,
} from './pages/MainPages'
import {
  CalendarPage,
  TasksPage,
  DocumentsPage,
  FinancePage,
  SettingsPage,
} from './pages/UtilPages'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Публичный маршрут — страница входа */}
        <Route path="/login" element={<LoginPage />} />

        {/* Все защищённые страницы оборачиваются в Layout (сайдбар + шапка) */}
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="cases/:id" element={<CaseDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Страница 404 — любой неизвестный маршрут */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
