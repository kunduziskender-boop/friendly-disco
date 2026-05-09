/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Полная база API без завершающего `/`, напр. `http://127.0.0.1:8000/api` или старый `http://127.0.0.1:8000` */
  readonly VITE_API_ROOT?: string;
  /** Корень сервера без суффикса `/api`; к нему добавляется `/api`, если не `VITE_API_LEGACY` */
  readonly VITE_API_BASE?: string;
  /** `true` — бэкенд без префикса `/api` (только старый API; регистрации на нём нет) */
  readonly VITE_API_LEGACY?: string;
}
