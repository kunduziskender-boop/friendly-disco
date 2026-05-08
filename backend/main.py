from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os

load_dotenv()

from api import auth, users, clients, cases, tasks, calendar, documents, finance
from storage.database import init_db, migrate_db
from storage.seed import seed_db

app = FastAPI(
    title=os.getenv("APP_TITLE", "Lawyer CRM API"),
    version=os.getenv("APP_VERSION", "1.0.0"),
    description="CRM-система для адвоката — backend API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


init_db()
migrate_db()
seed_db()


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(exc),
        },
    )


app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(clients.router, prefix="/clients", tags=["Clients"])
app.include_router(cases.router, prefix="/cases", tags=["Cases"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(calendar.router, prefix="/calendar-events", tags=["Calendar"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(finance.router, prefix="/finance-records", tags=["Finance"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": os.getenv("APP_TITLE", "Lawyer CRM API")}
