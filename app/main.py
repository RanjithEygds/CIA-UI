from fastapi import FastAPI
from .db import init_db
from .routers import engagements, interviews
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CIMMIE - CIA Assistant API", version="0.1.0")


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],   # or list ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]
    allow_headers=["*"],   # or list ["Authorization","Content-Type", ...]
    expose_headers=[],     # add if you need to read custom headers on client
    max_age=600,           # cache preflight (seconds)
)


@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(engagements.router, prefix="/engagements", tags=["engagements"])
app.include_router(interviews.router, prefix="/interviews", tags=["interviews"])