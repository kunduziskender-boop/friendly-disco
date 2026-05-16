/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Полная база API без завершающего `/`, напр. `http://127.0.0.1:8000/api` или старый `http://127.0.0.1:8000` */
  readonly VITE_API_ROOT?: string;
  /** Корень сервера без суффикса `/api`; к нему добавляется `/api`, если не `VITE_API_LEGACY` */
  readonly VITE_API_BASE?: string;
  /** Совместимо с sentry.io: DSN фронта; без него браузерный Sentry выключен. */
  readonly VITE_SENTRY_DSN?: string;
  /** От 0 до 1; доля производительность-трейсов (по умолчанию 0). */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}
