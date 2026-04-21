from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel
import httpx
import os
import asyncio
import secrets

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="Google Translate Clone")

_SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.add_middleware(SessionMiddleware, secret_key=_SECRET_KEY)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "tuke26"
AUTH_KEY = os.environ.get("AUTH_KEY", "")

# OpenAI API key stored in memory; can be preset via OPENAI_API_KEY env var
_openai_api_key: str = os.environ.get("OPENAI_API_KEY", "")

LANG_NAMES = {
    "auto": "любого",
    "sk": "словацкого",
    "ru": "русского",
    "uk": "украинского",
    "en": "английского",
}

LANG_NAMES_TO = {
    "auto": "любом",
    "sk": "словацком",
    "ru": "русском",
    "uk": "украинском",
    "en": "английском",
}


def _is_logged_in(request: Request) -> bool:
    return request.session.get("logged_in") is True


def _try_key_auth(request: Request) -> bool:
    """Return True if ?key= matches AUTH_KEY and session was set."""
    if not AUTH_KEY:
        return False
    key = request.query_params.get("key", "")
    if key and secrets.compare_digest(key, AUTH_KEY):
        request.session["logged_in"] = True
        return True
    return False


# ===== AUTH =====

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if _try_key_auth(request) or _is_logged_in(request):
        return RedirectResponse(url="/")
    return templates.TemplateResponse("login.html", {"request": request})


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
async def api_login(req: LoginRequest, request: Request):
    if req.username == ADMIN_USERNAME and req.password == ADMIN_PASSWORD:
        request.session["logged_in"] = True
        return {"ok": True}
    return JSONResponse(status_code=401, content={"ok": False, "error": "Неверный логин или пароль"})


@app.post("/api/logout")
async def api_logout(request: Request):
    request.session.clear()
    return {"ok": True}


# ===== SETTINGS =====

@app.get("/api/settings")
async def get_settings(request: Request):
    if not _is_logged_in(request):
        raise HTTPException(status_code=401)
    preview = f"sk-...{_openai_api_key[-4:]}" if _openai_api_key else ""
    return {"has_key": bool(_openai_api_key), "key_preview": preview}


class SettingsRequest(BaseModel):
    api_key: str


@app.post("/api/settings")
async def update_settings(req: SettingsRequest, request: Request):
    global _openai_api_key
    if not _is_logged_in(request):
        raise HTTPException(status_code=401)
    _openai_api_key = req.api_key.strip()
    return {"ok": True}


# ===== MAIN =====

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    _try_key_auth(request)
    if not _is_logged_in(request):
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("index.html", {"request": request})


# ===== TRANSLATE / AI =====

class TranslateRequest(BaseModel):
    text: str
    src: str = "auto"
    tgt: str = "ru"


class AIRequest(BaseModel):
    text: str
    src: str = "auto"
    tgt: str = "ru"


@app.post("/api/translate")
async def translate(req: TranslateRequest, request: Request):
    if not _is_logged_in(request):
        raise HTTPException(status_code=401)

    src_name = LANG_NAMES.get(req.src, req.src)
    tgt_name = LANG_NAMES_TO.get(req.tgt, req.tgt)

    if not req.text.strip():
        return {"translation": ""}

    if req.src == "auto":
        system = (
            f"Ты профессиональный переводчик. "
            f"Определи язык текста и переведи его на {tgt_name} языке. "
            f"Верни только перевод. Без пояснений."
        )
    else:
        system = (
            f"Ты профессиональный переводчик. "
            f"Переведи текст с {src_name} языка на {tgt_name} языке. "
            f"Верни только перевод. Без пояснений."
        )

    result = await call_openai(system, req.text)
    return {"translation": result}


@app.post("/api/ai")
async def ai_answer(req: AIRequest, request: Request):
    if not _is_logged_in(request):
        raise HTTPException(status_code=401)

    tgt_name = LANG_NAMES_TO.get(req.tgt, req.tgt)

    if not req.text.strip():
        return {"answer": ""}

    system = (
        f"Ты помощник для теста по психологии. "
        f"Отвечай очень кратко и только по сути. "
        f"Если это вопрос — выбери наиболее вероятный правильный ответ. "
        f"Если нужно объяснение — дай его в 1-2 предложениях. "
        f"Смотри на текст с точки зрения психологии. "
        f"Не переводи дословно. "
        f"Отвечай на {tgt_name} языке."
    )

    result = await call_openai(system, req.text)
    return {"answer": result}


async def call_openai(system: str, user_message: str) -> str:
    global _openai_api_key
    api_key = _openai_api_key

    if not api_key:
        return "Ошибка: API ключ не задан. Перейдите в настройки (⚙)."

    url = "https://api.openai.com/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.2,
        "max_tokens": 512,
    }

    retries = 3
    delay = 1

    async with httpx.AsyncClient(timeout=20.0) as client:
        for attempt in range(retries):
            try:
                resp = await client.post(url, headers=headers, json=payload)

                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"].strip()

                if resp.status_code == 401:
                    return "Ошибка: неверный API ключ OpenAI"

                if resp.status_code in (429, 503):
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue

                return f"Ошибка запроса ({resp.status_code})"

            except Exception:
                await asyncio.sleep(delay)
                delay *= 2

    return "Ошибка сервера"