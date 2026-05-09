# friendly-disco — CRM для адвоката

Полный стек: **фронтенд** (React + Vite) в каталоге **`фронтенд/`** и **бэкенд** (FastAPI) в **`backend/`** для учёта клиентов, дел, встреч и финансов. Данные на бэкенде — **SQLite** (файл по умолчанию `backend/crm.db`). REST-эндпоинты с префиксом **`/api`** (например `POST /api/auth/login`, `POST /api/auth/register`); для всех путей под `/api/*`, кроме регистрации и входа, нужен заголовок **`Authorization: Bearer <JWT>`** (проверка и в middleware, и в зависимостях).

Репозиторий: [kunduziskender-boop/friendly-disco](https://github.com/kunduziskender-boop/friendly-disco)

## Быстрый старт

### 1. Бэкенд (`backend/`)

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Unix:    source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # при необходимости отредактируйте SECRET_KEY
uvicorn main:app --reload --host 127.0.0.1 --port 8010
```

Swagger: http://127.0.0.1:8010/docs (authorize через Bearer token, выданный `POST /api/auth/login`).

Тестовые пользователи (seed):

| Email | Пароль | Роль |
|-------|--------|------|
| `admin@example.com` | `Admin1234` | admin |
| `lawyer@example.com` | `Lawyer1234` | lawyer |
| `assistant@example.com` | `Assist1234` | assistant |

### 2. Фронтенд (`фронтенд/`)

```bash
cd фронтенд
npm install
npm run dev
```

Откройте http://localhost:5173 (или следующий свободный порт — см. терминал) и войдите или зарегистрируйтесь на экране входа.

При `npm run dev` запросы к API идут на **`/api`** через прокси Vite на **`http://127.0.0.1:8010`** (`фронтенд/vite.config.ts`). Бэкенд по умолчанию поднимается на **8010** (команда `run-dev.ps1`), чтобы не конфликтовать со старым процессом на **8000**. Должны быть эндпоинты **`/api/...`**, в т.ч. **`POST /api/auth/register`**.

**Если вход/регистрация дают 404 («Not Found»):** почти всегда на порту **8000** всё ещё крутится **старый процесс uvicorn** (без `/api` и без регистрации). Остановите его и запустите снова из каталога `backend`:

```powershell
cd backend
.\run-dev.ps1
```

или вручную: `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8010`. В Swagger (**http://127.0.0.1:8010/docs**) должны быть маршруты **`/api/auth/register`**. Порт можно сменить: `$env:CRM_BACKEND_PORT=8000; .\run-dev.ps1` и тогда в `фронтенд/vite.config.ts` верните `target` прокси на этот порт.

Настройка адреса API на фронте (файл **`фронтенд/.env`**, см. **`фронтенд/.env.example`**): **`VITE_API_ROOT=http://127.0.0.1:8010/api`** (или ваш порт).

## Сборка фронта для продакшена

```bash
cd фронтенд
npm run build
npm run preview
```

## Возможности

- Обзор, клиенты (клик по клиенту — детали и связка с делами/встречами/финансами), дела, встречи, финансы
- JWT-авторизация, состояние загрузки и ошибок
- HTML-тест API: `backend/test_client.html` (открыть в браузере при запущенном сервере)

Для промышленного использования понадится реальная БД, аудит доступа и защита персональных данных по применимому законодательству.
