import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
if (sentryDsn) {
  const traces = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0);
  Sentry.init({
    dsn: sentryDsn,
    integrations: [],
    tracesSampleRate: Number.isFinite(traces) ? Math.min(1, Math.max(0, traces)) : 0,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

const appTree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(
  sentryDsn ? (
    <Sentry.ErrorBoundary
      fallback={<p style={{ padding: "1rem" }}>Произошла ошибка. Обновите страницу или попробуйте позже.</p>}
      showDialog={false}
    >
      {appTree}
    </Sentry.ErrorBoundary>
  ) : (
    appTree
  )
);
