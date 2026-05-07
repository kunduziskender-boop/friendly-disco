# friendly-disco — CRM для адвоката

Полный стек: **фронтенд** (React + Vite) и **бэкенд** (FastAPI) для учёта клиентов, дел, встреч и финансов. Данные на бэкенде хранятся **в памяти** (демо, без БД). Фронтенд по умолчанию обращается к API: `http://localhost:8000`.

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
uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

Тестовые пользователи (seed):

| Email | Пароль | Роль |
|-------|--------|------|
| `admin@example.com` | `Admin1234` | admin |
| `lawyer@example.com` | `Lawyer1234` | lawyer |
| `assistant@example.com` | `Assist1234` | assistant |

### 2. Фронтенд (корень репозитория)

```bash
npm install
npm run dev
```

Откройте http://localhost:5173 и войдите под одним из аккаунтов выше.

## Сборка фронта для продакшена

```bash
npm run build
npm run preview
```

## Возможности

- Обзор, клиенты (клик по клиенту — детали и связка с делами/встречами/финансами), дела, встречи, финансы
- JWT-авторизация, состояние загрузки и ошибок
- HTML-тест API: `backend/test_client.html` (открыть в браузере при запущенном сервере)

Для промышленного использования понадится реальная БД, аудит доступа и защита персональных данных по применимому законодательству.
