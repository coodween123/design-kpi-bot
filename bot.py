import os
import csv
import io
import json
import html
import re
import sqlite3
import zipfile
import logging
from datetime import datetime, date, timedelta, time as dt_time
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict
from typing import Any, Optional, Tuple, List

from telegram import Update, BotCommand
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

try:
    from telegram.ext import MessageReactionHandler
except ImportError:
    MessageReactionHandler = None

DB_PATH = os.getenv("DB_PATH", "design_kpi_bot.sqlite3")
BOT_TOKEN = os.getenv("BOT_TOKEN")
DATE_FMT = "%d.%m.%Y"
DATETIME_FMT = "%d.%m.%Y %H:%M"
TZ_NAME = "Europe/Moscow"
MSK = ZoneInfo(TZ_NAME)
MAX_TASK_TITLE_WORDS = 8
STATUSES = {
    "waiting": "ожидает принятия",
    "in_progress": "в работе",
    "rework": "на доработке",
    "done": "завершена",
}
MONTHS_RU = {
    1: "января",
    2: "февраля",
    3: "марта",
    4: "апреля",
    5: "мая",
    6: "июня",
    7: "июля",
    8: "августа",
    9: "сентября",
    10: "октября",
    11: "ноября",
    12: "декабря",
}
WEEKDAYS_RU = {
    0: "понедельник",
    1: "вторник",
    2: "среда",
    3: "четверг",
    4: "пятница",
    5: "суббота",
    6: "воскресенье",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def now_msk() -> datetime:
    return datetime.now(MSK)


def now_iso() -> str:
    return now_msk().isoformat(timespec="seconds")


def parse_dt(value: str) -> datetime:
    return datetime.strptime(value.strip(), DATETIME_FMT).replace(tzinfo=MSK)


TASK_BODY_RE = re.compile(r"^\s*(?P<title>.+?)\s+(?P<date>\d{2}\.\d{2}\.\d{4})\s+(?P<time>\d{2}:\d{2})\s+(?P<desc>.+?)\s*$")


def parse_task_body(raw: str) -> tuple[Optional[str], Optional[datetime], Optional[str], Optional[str]]:
    if "," in raw:
        return None, None, None, "Пишите без запятых."
    match = TASK_BODY_RE.match(raw)
    if not match:
        return None, None, None, "Неверный формат."
    title = match.group("title").strip()
    desc = match.group("desc").strip()
    if not title or not desc:
        return None, None, None, "Заполните название, дату, время и описание."
    if len(title.split()) > MAX_TASK_TITLE_WORDS:
        return None, None, None, f"Название задачи — максимум {MAX_TASK_TITLE_WORDS} слов."
    try:
        deadline = parse_dt(f"{match.group('date')} {match.group('time')}")
    except ValueError:
        return None, None, None, "Дедлайн нужен в формате: 31.07.2026 18:00"
    return title, deadline, desc, None


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), DATE_FMT).date()


def month_key(dt: datetime | date) -> str:
    return dt.strftime("%m.%Y")


def current_month() -> str:
    return now_msk().strftime("%m.%Y")


def previous_month() -> str:
    first = now_msk().date().replace(day=1)
    prev = first - timedelta(days=1)
    return prev.strftime("%m.%Y")


def fmt_dt(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    return parse_iso_msk(iso).strftime(DATETIME_FMT)


def fmt_date(d: date) -> str:
    return d.strftime(DATE_FMT)


def parse_iso_msk(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt.astimezone(MSK) if dt.tzinfo else dt.replace(tzinfo=MSK)


def user_name(update: Update) -> str:
    u = update.effective_user
    if not u:
        return "unknown"
    return f"@{u.username}" if u.username else f"id:{u.id}"


def user_name_from_user(user) -> str:
    if not user:
        return "unknown"
    return f"@{user.username}" if user.username else f"id:{user.id}"


def user_key(value: str) -> str:
    return (value or "").strip().lower().lstrip("@")


def html_quote_code(text: str) -> str:
    # Telegram blockquote + inline code. Works with HTML parse mode.
    import html
    return f"<blockquote><code>{html.escape(text)}</code></blockquote>"


COMMAND_HELP = {
    "help": "🔷 /help — показать меню команд",
    "task": f"🔷 /task (задача до {MAX_TASK_TITLE_WORDS} слов) (дата) (время) (описание) — создать задачу",
    "retask": f"🔷 /retask (ID) (задача до {MAX_TASK_TITLE_WORDS} слов) (дата) (время) (описание) — изменить задачу полностью",
    "ok": "🔷 /ok (ID) — принять задачу в работу",
    "done": "🔷 /done (ID) (0/1) — завершить задачу: 0 до 3 правок, 1 больше 3 правок",
    "reassign": "🔷 /reassign (ID) (@username) — переназначить исполнителя",
    "rework": "🔷 /rework (ID) (дата) (время) (причина) — отправить задачу на доработку с новым дедлайном",
    "tasks": "🔷 /tasks — показать активные задачи",
    "stats": "🔷 /stats (месяц.год) (@username) — показать статистику: без параметров вся команда за всё время, с ником конкретный человек",
    "report": "🔷 /report (месяц) — показать месячный отчет; месяц можно не писать",
    "month_report": "🔷 /month_report (месяц) — показать месячный отчет; месяц можно не писать",
    "top": "🔷 /top (месяц) — показать месячные номинации; месяц можно не писать",
    "history": "🔷 /history (месяц/all) (@designer) — скачать историю выполненных задач; параметры можно не писать",
    "online": "🔷 /online (дд.мм.гггг или мм.гггг или week) — показать кто работает сегодня, в конкретный день, за месяц или за неделю",
    "time": "🔷 /time — показать текущее время по Москве",
    "sobranie": "🔷 /sobranie (дата) (время) — запланировать собрание и напоминания",
    "add": "🔷 /add (@username) — добавить дизайнера",
    "remove": "🔷 /remove (@username) — убрать дизайнера из активных",
    "designers": "🔷 /designers — показать активных дизайнеров",
    "smena": "🔷 /smena (дата) (@designer) — задать старт графика 2/2",
    "swap": "🔷 /swap (дата) (@designer) (причина) — назначить подмену",
    "clearswap": "🔷 /clearswap (дата) — отменить подмену",
    "setlog": "🔷 /setlog — назначить текущую тему логом задач",
    "setreports": "🔷 /setreports — назначить текущую тему отчетами",
    "setdaily": "🔷 /setdaily — назначить текущий чат или тему для утренних задач",
    "fixquality": "🔷 /fixquality (ID) (0/1) — исправить качество: 0 до 3 правок, 1 больше 3 правок",
    "fixdeadline": "🔷 /fixdeadline (ID) (0/1) — исправить срок: 0 в срок, 1 просрочено",
}

MAIN_HELP_COMMANDS = [
    "help", "task", "retask", "ok", "done", "reassign", "rework", "tasks",
    "stats", "report", "top", "history", "online", "time", "sobranie",
    "add", "remove", "designers", "smena", "swap", "clearswap",
    "setlog", "setreports", "setdaily", "fixquality", "fixdeadline",
]

HELP_GROUPS = [
    ("Основное", ["help", "time", "sobranie"]),
    ("Задачи", ["task", "retask", "ok", "done", "reassign", "rework", "tasks"]),
    ("Статистика", ["stats", "report", "top", "history"]),
    ("График", ["online", "designers", "smena", "swap", "clearswap"]),
    ("Настройки", ["add", "remove", "setlog", "setreports", "setdaily", "fixquality", "fixdeadline"]),
]


def help_text(title: str, commands: list[str]) -> str:
    if commands == MAIN_HELP_COMMANDS:
        lines = [f"<b>{title}</b>", "<i>Команды собраны по разделам.</i>"]
        for group_title, group_commands in HELP_GROUPS:
            lines.append("")
            lines.append(f"<b>{group_title}</b>")
            lines.extend(COMMAND_HELP[name] for name in group_commands)
        return "\n".join(lines)
    return "\n".join([f"<b>{title}</b>", *[COMMAND_HELP[name] for name in commands]])


def command_usage(command: str, error: str = "Неверный формат.") -> str:
    return f"❌ {error}\n{COMMAND_HELP[command]}"


def pct(part: int, total: int) -> str:
    return "0%" if total == 0 else f"{part / total * 100:.2f}%"


def human_duration(seconds: Optional[float]) -> str:
    if seconds is None:
        return "—"
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h} ч. {m:02d} мин."


def meeting_date_text(value: datetime) -> str:
    return f"{value.day} {MONTHS_RU[value.month]} ({WEEKDAYS_RU[value.weekday()]}) в {value.strftime('%H:%M')} мск"


def meeting_reminder_text(meeting_at: datetime, kind: str) -> str:
    date_text = meeting_date_text(meeting_at)
    if kind == "day_before":
        return f"""<b>Команда, всем привет! ❤️</b>

Завтра, {date_text}, состоится наше ежемесячное общее собрание в Zoom.

Просим всех быть на встрече, кроме коллег, которые находятся в отпуске.

Пожалуйста, подключайтесь с включенными камерами - так нам проще сохранять живое общение, вовлеченность и единый ритм команды.

До встречи на созвоне!"""
    return f"""<b>Команда, всем привет! ❤️</b>

Напоминаю: сегодня, {date_text}, состоится наше общее собрание в Zoom.

До встречи через 2 часа. По возможности подключайтесь с включенными камерами, чтобы встреча была живой и общей."""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS designers (
            username TEXT PRIMARY KEY,
            added_at TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            deadline TEXT NOT NULL,
            accepted_by TEXT,
            accepted_at TEXT,
            completed_by TEXT,
            completed_at TEXT,
            status TEXT NOT NULL,
            quality_flag INTEGER,
            on_time INTEGER,
            created_month TEXT NOT NULL,
            completed_month TEXT,
            rework_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS task_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            task_id INTEGER,
            action TEXT NOT NULL,
            user TEXT,
            comment TEXT,
            old_status TEXT,
            new_status TEXT
        );

        CREATE TABLE IF NOT EXISTS bot_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            chat_id INTEGER,
            chat_title TEXT,
            message_id INTEGER,
            thread_id INTEGER,
            user_id INTEGER,
            username TEXT,
            user_display TEXT,
            command TEXT NOT NULL,
            args TEXT,
            text TEXT,
            status TEXT NOT NULL,
            error TEXT,
            duration_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            month TEXT NOT NULL,
            chat_id INTEGER,
            chat_title TEXT,
            message_id INTEGER,
            thread_id INTEGER,
            user_id INTEGER,
            username TEXT,
            user_display TEXT,
            text TEXT
        );

        CREATE TABLE IF NOT EXISTS stats_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            month TEXT NOT NULL,
            scope TEXT NOT NULL,
            requested_by TEXT,
            payload_json TEXT NOT NULL,
            rendered_text TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS shift_overrides (
            date TEXT PRIMARY KEY,
            designer TEXT NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS monthly_reports (
            month TEXT PRIMARY KEY,
            sent_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            day_before_sent INTEGER NOT NULL DEFAULT 0,
            two_hours_sent INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS deadline_alerts (
            task_id INTEGER PRIMARY KEY,
            alerted_at TEXT NOT NULL,
            notified_user TEXT,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS task_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            thread_id INTEGER,
            message_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(chat_id, message_id),
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_completed_month ON tasks(completed_month);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_month ON tasks(created_month);
        CREATE INDEX IF NOT EXISTS idx_tasks_accepted_by ON tasks(accepted_by);
        CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
        CREATE INDEX IF NOT EXISTS idx_task_messages_lookup ON task_messages(chat_id, message_id);
        CREATE INDEX IF NOT EXISTS idx_task_log_created_at ON task_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_bot_actions_created_at ON bot_actions(created_at);
        CREATE INDEX IF NOT EXISTS idx_bot_actions_command ON bot_actions(command);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_month_user ON chat_messages(month, user_display);
        CREATE INDEX IF NOT EXISTS idx_meetings_reminders ON meetings(meeting_at, day_before_sent, two_hours_sent);
        CREATE INDEX IF NOT EXISTS idx_stats_snapshots_month_scope ON stats_snapshots(month, scope);
        """)


def set_setting(key: str, value: str) -> None:
    with db() as conn:
        conn.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


def get_setting(key: str) -> Optional[str]:
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def get_log_chat_id() -> Optional[int]:
    chat_id = get_setting("log_chat_id")
    if chat_id:
        try:
            return int(chat_id)
        except ValueError:
            logger.warning("Invalid log_chat_id setting: %s", chat_id)
    with db() as conn:
        row = conn.execute("SELECT key FROM settings WHERE key LIKE 'log_topic:%' ORDER BY key LIMIT 1").fetchone()
    if not row:
        return None
    try:
        return int(row["key"].split(":", 1)[1])
    except (IndexError, ValueError):
        logger.warning("Invalid log topic setting key: %s", row["key"])
        return None


def log_action(task_id: Optional[int], action: str, user: str, comment: str = "", old_status: str = "", new_status: str = "") -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO task_log(created_at,task_id,action,user,comment,old_status,new_status) VALUES(?,?,?,?,?,?,?)",
            (now_iso(), task_id, action, user, comment, old_status, new_status),
        )


def remember_task_message(task_id: int, message, message_type: str) -> None:
    if not message:
        return
    try:
        chat_id = message.chat.id
        message_id = message.message_id
        thread_id = getattr(message, "message_thread_id", None)
    except AttributeError:
        return
    with db() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO task_messages(task_id,chat_id,message_id,thread_id,message_type,created_at)
               VALUES(?,?,?,?,?,?)""",
            (task_id, chat_id, message_id, thread_id, message_type, now_iso()),
        )


def task_message_by_reaction(chat_id: int, message_id: int):
    with db() as conn:
        return conn.execute(
            "SELECT * FROM task_messages WHERE chat_id=? AND message_id=?",
            (chat_id, message_id),
        ).fetchone()


def message_link(chat_id: Optional[int], message_id: Optional[int]) -> Optional[str]:
    if not chat_id or not message_id:
        return None
    chat_s = str(chat_id)
    if chat_s.startswith("-100"):
        return f"https://t.me/c/{chat_s[4:]}/{message_id}"
    return None


def task_source_link(task_id: int) -> Optional[str]:
    with db() as conn:
        row = conn.execute(
            """SELECT chat_id, message_id FROM task_messages
               WHERE task_id=?
               ORDER BY CASE message_type
                   WHEN 'task_source' THEN 0
                   WHEN 'task_log' THEN 1
                   WHEN 'task_reply' THEN 2
                   ELSE 3
               END, id ASC
               LIMIT 1""",
            (task_id,),
        ).fetchone()
    if not row:
        return None
    return message_link(row["chat_id"], row["message_id"])


def is_active_designer(username: str) -> bool:
    variants = {username}
    if username.startswith("@"):
        variants.add(username[1:])
    else:
        variants.add(f"@{username}")
    placeholders = ",".join("?" for _ in variants)
    with db() as conn:
        row = conn.execute(
            f"SELECT username FROM designers WHERE active=1 AND lower(username) IN ({placeholders})",
            tuple(v.lower() for v in variants),
        ).fetchone()
    return row is not None


def log_command_start(command: str, update: Update, context: ContextTypes.DEFAULT_TYPE) -> Optional[int]:
    message = update.effective_message
    chat = update.effective_chat
    user = update.effective_user
    text = ""
    if message:
        text = getattr(message, "text", None) or getattr(message, "caption", None) or ""
    chat_title = ""
    if chat:
        chat_title = getattr(chat, "title", None) or getattr(chat, "full_name", None) or ""
    username = f"@{user.username}" if user and user.username else ""
    try:
        with db() as conn:
            cur = conn.execute(
                """INSERT INTO bot_actions(
                    created_at, chat_id, chat_title, message_id, thread_id,
                    user_id, username, user_display, command, args, text, status
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    now_iso(),
                    chat.id if chat else None,
                    chat_title,
                    message.message_id if message else None,
                    getattr(message, "message_thread_id", None) if message else None,
                    user.id if user else None,
                    username,
                    user_name(update),
                    command,
                    " ".join(context.args or []),
                    text,
                    "started",
                ),
            )
            return int(cur.lastrowid)
    except Exception as e:
        logger.warning("Cannot write command log: %s", e)
        return None


def finish_command_log(action_id: Optional[int], status: str, started_at: datetime, error: str = "") -> None:
    if action_id is None:
        return
    duration_ms = int((now_msk() - started_at).total_seconds() * 1000)
    try:
        with db() as conn:
            conn.execute(
                "UPDATE bot_actions SET status=?, error=?, duration_ms=? WHERE id=?",
                (status, error, duration_ms, action_id),
            )
    except Exception as e:
        logger.warning("Cannot update command log: %s", e)


def log_chat_message(update: Update) -> None:
    message = update.effective_message
    chat = update.effective_chat
    user = update.effective_user
    if not message or not user or getattr(user, "is_bot", False):
        return
    text = getattr(message, "text", None) or getattr(message, "caption", None) or ""
    if not text or text.startswith("/"):
        return
    chat_title = ""
    if chat:
        chat_title = getattr(chat, "title", None) or getattr(chat, "full_name", None) or ""
    try:
        created_at = now_msk()
        with db() as conn:
            conn.execute(
                """INSERT INTO chat_messages(
                    created_at, month, chat_id, chat_title, message_id, thread_id,
                    user_id, username, user_display, text
                ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (
                    created_at.isoformat(timespec="seconds"),
                    month_key(created_at),
                    chat.id if chat else None,
                    chat_title,
                    message.message_id,
                    getattr(message, "message_thread_id", None),
                    user.id,
                    f"@{user.username}" if user.username else "",
                    user_name(update),
                    text[:4000],
                ),
            )
    except Exception as e:
        logger.warning("Cannot write chat message log: %s", e)


async def track_chat_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    log_chat_message(update)


def save_stats_snapshot(month: str, scope: str, requested_by: str, payload: dict[str, Any], rendered_text: str) -> None:
    try:
        with db() as conn:
            conn.execute(
                """INSERT INTO stats_snapshots(created_at,month,scope,requested_by,payload_json,rendered_text)
                   VALUES(?,?,?,?,?,?)""",
                (now_iso(), month, scope, requested_by, json.dumps(payload, ensure_ascii=False, sort_keys=True), rendered_text),
            )
    except Exception as e:
        logger.warning("Cannot save stats snapshot: %s", e)


async def send_log(context: ContextTypes.DEFAULT_TYPE, chat_id: int, text: str):
    topic = get_setting(f"log_topic:{chat_id}")
    try:
        return await context.bot.send_message(
            chat_id=chat_id,
            message_thread_id=int(topic) if topic else None,
            text=text,
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.warning("Cannot send log: %s", e)
        return None


def task_by_id(task_id: int):
    with db() as conn:
        return conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()


def completed_rows(month: Optional[str], user: Optional[str] = None):
    q = "SELECT * FROM tasks WHERE status='завершена'"
    args = []
    if month:
        q += " AND completed_month=?"
        args.append(month)
    if user:
        q += " AND accepted_by=?"
        args.append(user)
    with db() as conn:
        return conn.execute(q, args).fetchall()


def avg_completion(rows) -> Optional[float]:
    durations = []
    for r in rows:
        if not r["completed_at"]:
            continue
        start = r["accepted_at"] or r["created_at"]
        durations.append((parse_iso_msk(r["completed_at"]) - parse_iso_msk(start)).total_seconds())
    return sum(durations) / len(durations) if durations else None


def counter_payload(items) -> list[dict[str, Any]]:
    return [{"name": name, "count": count} for name, count in items]


def stats_payload(month: Optional[str], personal_user: Optional[str] = None) -> dict[str, Any]:
    rows = completed_rows(month, personal_user)
    total_done = len(rows)
    ontime = sum(1 for r in rows if r["on_time"] == 1)
    late = sum(1 for r in rows if r["on_time"] == 0)
    quality_bad = sum(1 for r in rows if r["quality_flag"] == 1)
    quality_good = total_done - quality_bad
    avg_seconds = avg_completion(rows)

    with db() as conn:
        if personal_user:
            if month:
                created = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE created_month=? AND created_by=?",
                    (month, personal_user),
                ).fetchone()["c"]
            else:
                created = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE created_by=?",
                    (personal_user,),
                ).fetchone()["c"]
            if month:
                active = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status!=? AND accepted_by=? AND created_month=?",
                    (STATUSES["done"], personal_user, month),
                ).fetchone()["c"]
                in_work = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status=? AND accepted_by=? AND created_month=?",
                    (STATUSES["in_progress"], personal_user, month),
                ).fetchone()["c"]
                rework = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status=? AND accepted_by=? AND created_month=?",
                    (STATUSES["rework"], personal_user, month),
                ).fetchone()["c"]
            else:
                active = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status!=? AND accepted_by=?",
                    (STATUSES["done"], personal_user),
                ).fetchone()["c"]
                in_work = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status=? AND accepted_by=?",
                    (STATUSES["in_progress"], personal_user),
                ).fetchone()["c"]
                rework = conn.execute(
                    "SELECT COUNT(*) c FROM tasks WHERE status=? AND accepted_by=?",
                    (STATUSES["rework"], personal_user),
                ).fetchone()["c"]
        else:
            if month:
                created = conn.execute("SELECT COUNT(*) c FROM tasks WHERE created_month=?", (month,)).fetchone()["c"]
                active = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status!=? AND created_month=?", (STATUSES["done"], month)).fetchone()["c"]
                in_work = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=? AND created_month=?", (STATUSES["in_progress"], month)).fetchone()["c"]
                rework = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=? AND created_month=?", (STATUSES["rework"], month)).fetchone()["c"]
                creator_rows = conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall()
            else:
                created = conn.execute("SELECT COUNT(*) c FROM tasks").fetchone()["c"]
                active = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status!=?", (STATUSES["done"],)).fetchone()["c"]
                in_work = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=?", (STATUSES["in_progress"],)).fetchone()["c"]
                rework = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=?", (STATUSES["rework"],)).fetchone()["c"]
                creator_rows = conn.execute("SELECT created_by FROM tasks").fetchall()

    exec_top = Counter(r["accepted_by"] or "—" for r in rows).most_common(10)
    creator_top = Counter()
    if personal_user:
        creator_top[personal_user] = created
    else:
        for r in creator_rows:
            creator_top[r["created_by"]] += 1

    return {
        "month": month or "all",
        "timezone": TZ_NAME,
        "scope": "personal" if personal_user else "team",
        "user": personal_user,
        "task_ids": [r["id"] for r in rows],
        "tasks": {
            "created": created,
            "completed": total_done,
            "active": active,
            "in_work": in_work,
            "rework": rework,
        },
        "deadlines": {
            "on_time": ontime,
            "late": late,
            "late_percent": pct(late, total_done),
        },
        "quality": {
            "good": quality_good,
            "bad": quality_bad,
            "bad_percent": pct(quality_bad, total_done),
        },
        "efficiency": {
            "avg_completion_seconds": avg_seconds,
            "avg_completion": human_duration(avg_seconds),
        },
        "top_executors": counter_payload(exec_top),
        "top_creators": counter_payload(creator_top.most_common(10)),
    }


def report_payload(month: str) -> dict[str, Any]:
    payload = stats_payload(month)
    rows = completed_rows(month)
    per = defaultdict(list)
    for r in rows:
        per[r["accepted_by"] or "—"].append(r)
    performers = sorted(per.items(), key=lambda x: len(x[1]), reverse=True)
    report_rows = []
    for name, rs in performers[:10]:
        avg_seconds = avg_completion(rs)
        report_rows.append({
            "name": name,
            "completed": len(rs),
            "on_time": sum(1 for r in rs if r["on_time"] == 1),
            "late": sum(1 for r in rs if r["on_time"] == 0),
            "quality_bad": sum(1 for r in rs if r["quality_flag"] == 1),
            "avg_completion_seconds": avg_seconds,
            "avg_completion": human_duration(avg_seconds),
        })
    payload["scope"] = "report"
    payload["report"] = {
        "performers": report_rows,
        "best": report_rows[0] if report_rows else None,
    }
    return payload


def top_payload(month: str) -> dict[str, Any]:
    rows = completed_rows(month)
    grouped = defaultdict(list)
    for r in rows:
        grouped[r["accepted_by"] or r["completed_by"] or "—"].append(r)

    performers = []
    for name, items in grouped.items():
        total = len(items)
        avg_seconds = avg_completion(items)
        on_time = sum(1 for r in items if r["on_time"] == 1)
        quality_good = sum(1 for r in items if r["quality_flag"] == 0)
        performers.append({
            "name": name,
            "completed": total,
            "avg_completion_seconds": avg_seconds,
            "avg_completion": human_duration(avg_seconds),
            "on_time": on_time,
            "on_time_percent": pct(on_time, total),
            "on_time_ratio": on_time / total if total else 0,
            "quality_good": quality_good,
            "quality_good_percent": pct(quality_good, total),
            "quality_good_ratio": quality_good / total if total else 0,
        })

    top_completed = sorted(performers, key=lambda p: (-p["completed"], p["name"]))[:3]
    top_speed = sorted(
        [p for p in performers if p["avg_completion_seconds"] is not None],
        key=lambda p: (p["avg_completion_seconds"], -p["completed"], p["name"]),
    )[:3]
    top_deadlines = sorted(
        performers,
        key=lambda p: (-p["on_time_ratio"], -p["on_time"], -p["completed"], p["name"]),
    )[:3]
    top_quality = sorted(
        performers,
        key=lambda p: (-p["quality_good_ratio"], -p["quality_good"], -p["completed"], p["name"]),
    )[:3]

    with db() as conn:
        creators = Counter(r["created_by"] for r in conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall())
        message_rows = conn.execute(
            "SELECT user_display, COUNT(*) c FROM chat_messages WHERE month=? GROUP BY user_display",
            (month,),
        ).fetchall()
    top_creators = counter_payload(creators.most_common(3))
    active_by_key = {user_key(name): name for name in active_designers()}
    chat_counts = {name: 0 for name in active_by_key.values()}
    for row in message_rows:
        name = active_by_key.get(user_key(row["user_display"]))
        if name:
            chat_counts[name] += row["c"]
    top_quiet = [
        {"name": name, "messages": count}
        for name, count in sorted(chat_counts.items(), key=lambda item: (item[1], item[0]))[:3]
    ]
    return {
        "month": month,
        "timezone": TZ_NAME,
        "scope": "top",
        "nominations": {
            "top_completed": top_completed,
            "top_speed": top_speed,
            "top_deadlines": top_deadlines,
            "top_quality": top_quality,
            "top_creators": top_creators,
            "top_quiet": top_quiet,
        },
        "top_executors": counter_payload([(p["name"], p["completed"]) for p in top_completed]),
        "top_creators": top_creators,
    }


HISTORY_FIELDS = [
    "Месяц",
    "ID",
    "Дизайнер",
    "Название",
    "Описание",
    "Автор",
    "Создана",
    "Принята",
    "Завершена",
    "Закрыл",
    "Дедлайн",
    "Срок",
    "Правки",
    "Доработок",
]

HISTORY_SUMMARY_FIELDS = [
    "Дизайнер",
    "Месяц",
    "Выполнено",
    "В срок",
    "Просрочено",
    "Просрочено %",
    "До 3 правок",
    "Более 3 правок",
    "Более 3 правок %",
    "Среднее время выполнения",
]


def safe_filename_part(value: str) -> str:
    cleaned = value.strip().strip("@") or "unknown"
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in cleaned)


def parse_history_args(args: list[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    month: Optional[str] = current_month()
    designer: Optional[str] = None
    for arg in args:
        item = arg.strip()
        if not item:
            continue
        if item.lower() == "all":
            month = None
        elif item.startswith("@") or item.startswith("id:"):
            designer = item
        else:
            try:
                datetime.strptime(item, "%m.%Y")
            except ValueError:
                return None, None, "Месяц нужен в формате 06.2026 или используйте all."
            month = item
    return month, designer, None


def parse_month_user_args(args: list[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    month: Optional[str] = None
    user: Optional[str] = None
    for arg in args:
        item = arg.strip()
        if not item:
            continue
        if item.startswith("@") or item.startswith("id:"):
            user = item
            continue
        try:
            datetime.strptime(item, "%m.%Y")
        except ValueError:
            return None, None, "Месяц нужен в формате 07.2026, пользователь — в формате @username."
        month = item
    return month, user, None


def completed_history_rows(month: Optional[str], designer: Optional[str] = None):
    query = "SELECT * FROM tasks WHERE status=? AND completed_at IS NOT NULL"
    args: list[Any] = [STATUSES["done"]]
    if month:
        query += " AND completed_month=?"
        args.append(month)
    if designer:
        query += " AND (accepted_by=? OR completed_by=?)"
        args.extend([designer, designer])
    query += " ORDER BY completed_at ASC, accepted_by ASC"
    with db() as conn:
        return conn.execute(query, args).fetchall()


def task_designer(row) -> str:
    return row["accepted_by"] or row["completed_by"] or "—"


def month_sort_key(value: str) -> tuple[int, int]:
    try:
        month, year = value.split(".", 1)
        return int(year), int(month)
    except (ValueError, AttributeError):
        return 9999, 99


def history_record(row) -> dict[str, Any]:
    quality = "—"
    if row["quality_flag"] == 0:
        quality = "до 3 правок"
    elif row["quality_flag"] == 1:
        quality = "более 3 правок"
    deadline_status = "—"
    if row["on_time"] == 1:
        deadline_status = "в срок"
    elif row["on_time"] == 0:
        deadline_status = "просрочен"
    return {
        "Месяц": row["completed_month"] or "—",
        "ID": row["id"],
        "Дизайнер": task_designer(row),
        "Название": row["title"],
        "Описание": row["description"] or "",
        "Автор": row["created_by"],
        "Создана": fmt_dt(row["created_at"]),
        "Принята": fmt_dt(row["accepted_at"]),
        "Завершена": fmt_dt(row["completed_at"]),
        "Закрыл": row["completed_by"] or "—",
        "Дедлайн": fmt_dt(row["deadline"]),
        "Срок": deadline_status,
        "Правки": quality,
        "Доработок": row["rework_count"],
    }


def csv_bytes(records: list[dict[str, Any]], fields: list[str]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, delimiter=";")
    writer.writeheader()
    writer.writerows(records)
    return output.getvalue().encode("utf-8-sig")


def history_summary_records(rows) -> list[dict[str, Any]]:
    grouped = defaultdict(list)
    for row in rows:
        grouped[(task_designer(row), row["completed_month"] or "—")].append(row)
    summary = []
    for (designer, month), items in sorted(grouped.items(), key=lambda x: (x[0][0], month_sort_key(x[0][1]))):
        total = len(items)
        late = sum(1 for r in items if r["on_time"] == 0)
        quality_bad = sum(1 for r in items if r["quality_flag"] == 1)
        summary.append({
            "Дизайнер": designer,
            "Месяц": month,
            "Выполнено": total,
            "В срок": sum(1 for r in items if r["on_time"] == 1),
            "Просрочено": late,
            "Просрочено %": pct(late, total),
            "До 3 правок": sum(1 for r in items if r["quality_flag"] == 0),
            "Более 3 правок": quality_bad,
            "Более 3 правок %": pct(quality_bad, total),
            "Среднее время выполнения": human_duration(avg_completion(items)),
        })
    return summary


def build_history_zip(rows, month: Optional[str], designer: Optional[str]) -> tuple[bytes, str]:
    all_records = [history_record(row) for row in rows]
    period = month.replace(".", "-") if month else "all"
    designer_part = f"_{safe_filename_part(designer)}" if designer else ""
    filename = f"design_kpi_history_{period}{designer_part}.zip"

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("all_tasks.csv", csv_bytes(all_records, HISTORY_FIELDS))
        zf.writestr("summary_by_designer.csv", csv_bytes(history_summary_records(rows), HISTORY_SUMMARY_FIELDS))

        by_designer = defaultdict(list)
        for row in rows:
            by_designer[task_designer(row)].append(row)
        for name, designer_rows in sorted(by_designer.items()):
            records = [history_record(row) for row in designer_rows]
            zf.writestr(f"designer_{safe_filename_part(name)}.csv", csv_bytes(records, HISTORY_FIELDS))

    archive.seek(0)
    return archive.getvalue(), filename


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await help_cmd(update, context)


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(help_text("🔷 МЕНЮ КОМАНД", MAIN_HELP_COMMANDS), parse_mode=ParseMode.HTML)

async def setup_commands(app: Application):
    await app.bot.set_my_commands([
        BotCommand("help", "меню команд"),
        BotCommand("task", "(задача) (дата) (время) (описание)"),
        BotCommand("retask", "(ID) (задача) (дата) (время) (описание)"),
        BotCommand("tasks", "активные задачи"),
        BotCommand("stats", "(месяц.год) (@username) статистика"),
        BotCommand("report", "(месяц) месячный отчет"),
        BotCommand("top", "(месяц) рейтинг"),
        BotCommand("history", "(месяц/all) (@designer) история файлом"),
        BotCommand("online", "(дата или месяц или week) кто работает"),
        BotCommand("time", "время по Москве"),
        BotCommand("sobranie", "(дата) (время) собрание"),
        BotCommand("add", "(@username) добавить дизайнера"),
        BotCommand("remove", "(@username) удалить дизайнера"),
        BotCommand("designers", "активные дизайнеры"),
        BotCommand("smena", "(дата) (@designer) старт графика 2/2"),
        BotCommand("swap", "(дата) (@designer) подмена"),
        BotCommand("clearswap", "(дата) отменить подмену"),
        BotCommand("setlog", "назначить лог"),
        BotCommand("setreports", "назначить отчеты"),
        BotCommand("setdaily", "назначить утренние задачи"),
        BotCommand("fixquality", "(ID) (0/1) исправить качество"),
        BotCommand("fixdeadline", "(ID) (0/1) исправить срок"),
    ])


async def time_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"🕒 Сейчас по Москве: {now_msk().strftime(DATETIME_FMT)}")


async def sobranie_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text(command_usage("sobranie"))
        return
    try:
        meeting_at = parse_dt(f"{context.args[0].rstrip(',')} {context.args[1].rstrip(',')}")
    except ValueError:
        await update.message.reply_text(command_usage("sobranie", "Дата и время нужны в формате 06.07.2026 11:00."))
        return
    current_msk = now_msk()
    if meeting_at <= current_msk:
        await update.message.reply_text(f"❌ Нельзя поставить собрание в прошлом.\nСейчас по Москве: {current_msk.strftime(DATETIME_FMT)}")
        return
    if not get_setting("daily_chat_id"):
        await update.message.reply_text("❌ Сначала назначьте чат для напоминаний командой /setdaily.")
        return

    actor = user_name(update)
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO meetings(meeting_at,created_at,created_by)
               VALUES(?,?,?)""",
            (meeting_at.isoformat(timespec="seconds"), current_msk.isoformat(timespec="seconds"), actor),
        )
        meeting_id = cur.lastrowid

    day_before = datetime.combine(meeting_at.date() - timedelta(days=1), dt_time(hour=18, minute=0, tzinfo=MSK))
    two_hours = meeting_at - timedelta(hours=2)
    await update.message.reply_text(
        f"✅ Собрание #{meeting_id} запланировано.\n"
        f"Когда: {meeting_date_text(meeting_at)}\n"
        f"Напоминания:\n"
        f"• {day_before.strftime(DATETIME_FMT)}\n"
        f"• {two_hours.strftime(DATETIME_FMT)}"
    )


async def history_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month, designer, error = parse_history_args(context.args or [])
    if error:
        await update.message.reply_text(command_usage("history", error))
        return

    rows = completed_history_rows(month, designer)
    if not rows:
        period_text = month or "вся история"
        designer_text = f" для {designer}" if designer else ""
        await update.message.reply_text(f"✅ Выполненных задач за период {period_text}{designer_text} не найдено.")
        return

    data, filename = build_history_zip(rows, month, designer)
    file_obj = io.BytesIO(data)
    file_obj.name = filename
    period_text = month or "вся история"
    designer_text = f"\nДизайнер: {designer}" if designer else "\nДизайнеры: все"
    caption = (
        f"📦 История выполненных задач\n"
        f"Период: {period_text}"
        f"{designer_text}\n"
        f"Задач: {len(rows)}"
    )
    await update.message.reply_document(document=file_obj, filename=filename, caption=caption)


async def task_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.partition(" ")[2]
    title, deadline, desc, error = parse_task_body(raw)
    if error:
        await update.message.reply_text(command_usage("task", error))
        return
    if not title or not deadline or not desc:
        await update.message.reply_text(command_usage("task"))
        return
    current_msk = now_msk()
    if deadline <= current_msk:
        await update.message.reply_text(f"❌ Нельзя создать задачу с дедлайном в прошлом.\nСейчас по Москве: {current_msk.strftime(DATETIME_FMT)}")
        return
    creator = user_name(update)
    created_at = now_iso()
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO tasks(title,description,created_by,created_at,deadline,status,created_month)
               VALUES(?,?,?,?,?,?,?)""",
            (title, desc, creator, created_at, deadline.isoformat(timespec="seconds"), STATUSES["waiting"], month_key(parse_iso_msk(created_at))),
        )
        task_id = cur.lastrowid
    log_action(task_id, "create", creator, title, "", STATUSES["waiting"])
    remember_task_message(task_id, update.message, "task_source")
    reply_msg = await update.message.reply_text(f"✅ Задача #{task_id} создана. Статус: ожидает принятия.")
    remember_task_message(task_id, reply_msg, "task_reply")
    log_msg = await send_log(context, update.effective_chat.id, f"<b>✅ Создана задача #{task_id}</b>\n\n<b>{title}</b>\nДедлайн: {deadline.strftime(DATETIME_FMT)}\nАвтор: {creator}\n\n{desc}")
    remember_task_message(task_id, log_msg, "task_log")


async def retask_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.partition(" ")[2]
    task_id_s, sep, body = raw.partition(" ")
    if not sep or not task_id_s.isdigit():
        await update.message.reply_text(command_usage("retask"))
        return

    task_id = int(task_id_s)
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return

    new_title, new_deadline, new_desc, error = parse_task_body(body)
    if error:
        await update.message.reply_text(command_usage("retask", error))
        return
    if not new_title or not new_deadline or not new_desc:
        await update.message.reply_text(command_usage("retask"))
        return

    current_msk = now_msk()
    if row["status"] != STATUSES["done"] and new_deadline <= current_msk:
        await update.message.reply_text(f"❌ Нельзя поставить дедлайн в прошлом.\nСейчас по Москве: {current_msk.strftime(DATETIME_FMT)}")
        return

    on_time = row["on_time"]
    if row["completed_at"]:
        on_time = 1 if parse_iso_msk(row["completed_at"]) <= new_deadline else 0

    actor = user_name(update)
    old_deadline = fmt_dt(row["deadline"])
    new_deadline_iso = new_deadline.isoformat(timespec="seconds")
    with db() as conn:
        conn.execute(
            """UPDATE tasks
               SET title=?, description=?, deadline=?, on_time=?
               WHERE id=?""",
            (new_title, new_desc, new_deadline_iso, on_time, task_id),
        )
        if row["status"] != STATUSES["done"]:
            conn.execute("DELETE FROM deadline_alerts WHERE task_id=?", (task_id,))

    comment = (
        f"title: {row['title']} -> {new_title}; "
        f"deadline: {old_deadline} -> {new_deadline.strftime(DATETIME_FMT)}"
    )
    log_action(task_id, "retask", actor, comment, row["status"], row["status"])

    deadline_status = ""
    if row["completed_at"]:
        deadline_status = f"\nСрок после правки: {'в срок' if on_time else 'просрочен'}"
    await update.message.reply_text(
        f"✅ Задача #{task_id} изменена.\n\n"
        f"Название: {new_title}\n"
        f"Дедлайн: {new_deadline.strftime(DATETIME_FMT)}"
        f"{deadline_status}"
    )
    await send_log(
        context,
        update.effective_chat.id,
        f"<b>✏️ Изменена задача #{task_id}</b>\n"
        f"Кто изменил: {html.escape(actor)}\n"
        f"Название: {html.escape(row['title'])} → {html.escape(new_title)}\n"
        f"Дедлайн: {html.escape(old_deadline)} → {new_deadline.strftime(DATETIME_FMT)}",
    )


async def ok_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args or not context.args[0].isdigit():
        await update.message.reply_text(command_usage("ok"))
        return
    task_id = int(context.args[0])
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    if row["accepted_by"] and row["status"] != STATUSES["waiting"]:
        await update.message.reply_text(f"❌ Задача уже назначена на {row['accepted_by']}.\nИспользуйте /reassign для переназначения.")
        return
    executor = user_name(update)
    with db() as conn:
        conn.execute("UPDATE tasks SET accepted_by=?, accepted_at=?, status=? WHERE id=?", (executor, now_iso(), STATUSES["in_progress"], task_id))
    log_action(task_id, "accept", executor, "", row["status"], STATUSES["in_progress"])
    await update.message.reply_text(f"🔵 Задача #{task_id} принята в работу. Исполнитель: {executor}")
    await send_log(context, update.effective_chat.id, f"<b>🔵 Задача #{task_id} принята</b>\nИсполнитель: {executor}")


async def reaction_accept_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    reaction = getattr(update, "message_reaction", None)
    if not reaction or not reaction.new_reaction:
        return
    if not reaction.user:
        return

    executor = user_name_from_user(reaction.user)
    if not is_active_designer(executor):
        return

    message_link = task_message_by_reaction(reaction.chat.id, reaction.message_id)
    if not message_link:
        return

    task_id = message_link["task_id"]
    row = task_by_id(task_id)
    if not row or row["status"] != STATUSES["waiting"] or row["accepted_by"]:
        return

    accepted_at = now_iso()
    with db() as conn:
        conn.execute(
            "UPDATE tasks SET accepted_by=?, accepted_at=?, status=? WHERE id=?",
            (executor, accepted_at, STATUSES["in_progress"], task_id),
        )
    log_action(task_id, "accept_reaction", executor, f"reaction_message_id={reaction.message_id}", row["status"], STATUSES["in_progress"])

    text = f"<b>🔵 Задача #{task_id} принята реакцией</b>\nИсполнитель: {html.escape(executor)}"
    await context.bot.send_message(
        chat_id=reaction.chat.id,
        message_thread_id=message_link["thread_id"],
        text=text,
        parse_mode=ParseMode.HTML,
    )
    if reaction.chat.id != get_log_chat_id():
        await send_log(context, reaction.chat.id, text)


async def reassign_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit():
        await update.message.reply_text(command_usage("reassign"))
        return
    task_id = int(context.args[0])
    new_user = context.args[1]
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    if row["status"] == STATUSES["done"]:
        await update.message.reply_text("❌ Завершённую задачу нельзя переназначить.")
        return
    old = row["accepted_by"] or "—"
    with db() as conn:
        conn.execute("UPDATE tasks SET accepted_by=?, accepted_at=COALESCE(accepted_at, ?) WHERE id=?", (new_user, now_iso(), task_id))
    actor = user_name(update)
    log_action(task_id, "reassign", actor, f"{old} -> {new_user}", row["status"], row["status"])
    msg = f"🔄 Задача #{task_id} переназначена.\n\nСтарый исполнитель: {old}\nНовый исполнитель: {new_user}"
    await update.message.reply_text(msg)
    await send_log(context, update.effective_chat.id, f"<b>🔄 Переназначение задачи #{task_id}</b>\nСтарый: {old}\nНовый: {new_user}\nКто изменил: {actor}")


async def done_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit() or context.args[1] not in {"0", "1"}:
        await update.message.reply_text(command_usage("done"))
        return
    task_id = int(context.args[0])
    qflag = int(context.args[1])
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    completed_at = now_msk()
    deadline = parse_iso_msk(row["deadline"])
    on_time = 1 if completed_at <= deadline else 0
    deadline_status = "в срок" if on_time else "просрочен"
    actor = user_name(update)
    with db() as conn:
        conn.execute(
            """UPDATE tasks SET completed_by=?, completed_at=?, status=?, quality_flag=?, on_time=?, completed_month=? WHERE id=?""",
            (actor, completed_at.isoformat(timespec="seconds"), STATUSES["done"], qflag, on_time, month_key(completed_at), task_id),
        )
    log_action(task_id, "done", actor, f"quality={qflag}; on_time={on_time}", row["status"], STATUSES["done"])
    await update.message.reply_text(f"🟢 Задача #{task_id} завершена. Срок: {deadline_status}. Правки: {'более 3' if qflag else 'до 3'}.")
    await send_log(context, update.effective_chat.id, f"<b>🟢 Завершена задача #{task_id}</b>\nСрок: {deadline_status}\nПравки: {'более 3' if qflag else 'до 3'}\nЗакрыл: {actor}")


async def rework_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 4 or not context.args[0].isdigit():
        await update.message.reply_text(command_usage("rework"))
        return
    task_id = int(context.args[0])
    try:
        new_deadline = parse_dt(f"{context.args[1]} {context.args[2]}")
    except ValueError:
        await update.message.reply_text(command_usage("rework", "Дедлайн нужен в формате 31.07.2026 18:00."))
        return
    current_msk = now_msk()
    if new_deadline <= current_msk:
        await update.message.reply_text(f"❌ Нельзя поставить дедлайн в прошлом.\nСейчас по Москве: {current_msk.strftime(DATETIME_FMT)}")
        return
    reason = " ".join(context.args[3:]).strip()
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    designer, mode, shift_reason = shift_for(current_msk.date())
    if mode == "error":
        await update.message.reply_text(f"❌ {shift_reason}")
        return
    assigned_at = now_iso()
    with db() as conn:
        conn.execute(
            """UPDATE tasks
               SET status=?, deadline=?, accepted_by=?, accepted_at=?,
                   completed_by=NULL, completed_at=NULL, quality_flag=NULL,
                   on_time=NULL, completed_month=NULL, rework_count=rework_count+1
               WHERE id=?""",
            (STATUSES["rework"], new_deadline.isoformat(timespec="seconds"), designer, assigned_at, task_id),
        )
        conn.execute("DELETE FROM deadline_alerts WHERE task_id=?", (task_id,))
    actor = user_name(update)
    shift_note = " (подмена)" if mode == "swap" else ""
    log_action(
        task_id,
        "rework",
        actor,
        f"deadline={new_deadline.strftime(DATETIME_FMT)}; assigned={designer}; reason={reason}",
        row["status"],
        STATUSES["rework"],
    )
    await update.message.reply_text(
        f"🟠 Задача #{task_id} отправлена на доработку.\n"
        f"Новый дедлайн: {new_deadline.strftime(DATETIME_FMT)}\n"
        f"Исполнитель сегодняшней смены: {designer}{shift_note}\n"
        f"Причина: {reason}"
    )
    await send_log(
        context,
        update.effective_chat.id,
        f"<b>🟠 Доработка задачи #{task_id}</b>\n"
        f"Новый дедлайн: {new_deadline.strftime(DATETIME_FMT)}\n"
        f"Исполнитель сегодняшней смены: {html.escape(designer)}{shift_note}\n"
        f"Причина: {html.escape(reason)}\n"
        f"Кто отправил: {html.escape(actor)}",
    )


async def tasks_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with db() as conn:
        rows = conn.execute("SELECT * FROM tasks WHERE status!='завершена' ORDER BY deadline ASC").fetchall()
    if not rows:
        await update.message.reply_text("✅ Активных задач нет.")
        return
    lines = ["<b>📋 АКТИВНЫЕ ЗАДАЧИ</b>", "· · ·"]
    current_msk = now_msk()
    for r in rows:
        deadline_note = "\nСрок: просрочен" if parse_iso_msk(r["deadline"]) < current_msk else ""
        lines.append(f"<b>#{r['id']} — {r['title']}</b>\nДедлайн: {fmt_dt(r['deadline'])}{deadline_note}\nСтатус: {r['status']}\nИсполнитель: {r['accepted_by'] or '—'}")
    await update.message.reply_text("\n\n".join(lines), parse_mode=ParseMode.HTML)


def stats_text(month: Optional[str], personal_user: Optional[str] = None, payload: Optional[dict[str, Any]] = None) -> str:
    data = payload or stats_payload(month, personal_user)
    period = month or "всё время"
    total_done = data["tasks"]["completed"]
    ontime = data["deadlines"]["on_time"]
    late = data["deadlines"]["late"]
    quality_bad = data["quality"]["bad"]
    quality_good = data["quality"]["good"]
    avg = data["efficiency"]["avg_completion"]
    if personal_user:
        return f"""
<b>👤 СТАТИСТИКА {personal_user} — {period}</b>

· · ·

<b>📌 Задачи</b>
Выполнено задач: {total_done}

· · ·

<b>⏱ Сроки</b>
В срок: {ontime}
Просрочено: {late}
Процент просрочек: {pct(late, total_done)}

· · ·

<b>🎯 Качество</b>
До 3 правок: {quality_good}
Более 3 правок: {quality_bad}
Процент задач с правками: {pct(quality_bad, total_done)}

· · ·

<b>⚡ Среднее время выполнения</b>
{avg}
""".strip()
    created = data["tasks"]["created"]
    active = data["tasks"]["active"]
    in_work = data["tasks"]["in_work"]
    rework = data["tasks"]["rework"]
    exec_top = [(item["name"], item["count"]) for item in data["top_executors"][:3]]
    creator_top = [(item["name"], item["count"]) for item in data["top_creators"][:3]]
    def top_lines(items):
        medals = ["🥇", "🥈", "🥉"]
        return "\n".join(f"{medals[i]} {name} — {count}" for i, (name, count) in enumerate(items)) or "—"
    return f"""
<b>📊 СТАТИСТИКА — {period}</b>

· · ·

<b>📌 Задачи</b>
Создано задач: {created}
Завершено задач: {total_done}
Активных задач: {active}
В работе: {in_work}
На доработке: {rework}

· · ·

<b>⏱ Сроки</b>
В срок: {ontime}
Просрочено: {late}
Процент просрочек: {pct(late, total_done)}

· · ·

<b>🎯 Качество</b>
До 3 правок: {quality_good}
Более 3 правок: {quality_bad}
Процент задач с правками: {pct(quality_bad, total_done)}

· · ·

<b>⚡ Эффективность</b>
Среднее время выполнения: {avg}

· · ·

<b>🏆 Топ исполнителей</b>
{top_lines(exec_top)}

· · ·

<b>📨 Кто ставит больше задач</b>
{top_lines(creator_top)}
""".strip()


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month, user, error = parse_month_user_args(context.args or [])
    if error:
        await update.message.reply_text(command_usage("stats", error))
        return
    payload = stats_payload(month, user)
    text = stats_text(month, user, payload)
    save_stats_snapshot(month or "all", "personal_stats" if user else "team_stats", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


def report_text(month: str, payload: Optional[dict[str, Any]] = None) -> str:
    data = payload or report_payload(month)
    base = stats_text(month, payload=data)
    performers = data["report"]["performers"]
    details = []
    medals = ["🥇", "🥈", "🥉"]
    for i, item in enumerate(performers[:10]):
        details.append(f"{medals[i] if i < 3 else '•'} {item['name']} — {item['completed']} задач\n• В срок: {item['on_time']}\n• Просрочек: {item['late']}\n• С правками более 3: {item['quality_bad']}\n• Среднее время: {item['avg_completion']}")
    best_item = data["report"]["best"]
    best = best_item["name"] if best_item else "—"
    best_count = best_item["completed"] if best_item else 0
    return base.replace("<b>📊 СТАТИСТИКА", "<b>📈 ОТЧЁТ") + f"\n\n· · ·\n\n<b>👨‍🎨 Исполнители</b>\n" + ("\n\n".join(details) or "—") + f"\n\n· · ·\n\n<b>🏆 Лучший исполнитель месяца</b>\n{best} — {best_count} выполненных задач."


async def report_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    payload = report_payload(month)
    text = report_text(month, payload)
    save_stats_snapshot(month, "report", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def top_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    payload = top_payload(month)
    nominations = payload["nominations"]
    medals = ["🥇", "🥈", "🥉"]
    def nomination_lines(items, formatter):
        return "\n".join(f"{medals[i] if i < 3 else '•'} {formatter(item)}" for i, item in enumerate(items)) or "—"

    most_done = nomination_lines(
        nominations["top_completed"],
        lambda item: f"{item['name']} — {item['completed']} закрытых задач",
    )
    fastest = nomination_lines(
        nominations["top_speed"],
        lambda item: f"{item['name']} — в среднем {item['avg_completion']} на задачу",
    )
    deadline_best = nomination_lines(
        nominations["top_deadlines"],
        lambda item: f"{item['name']} — {item['on_time_percent']} задач в срок ({item['on_time']} из {item['completed']})",
    )
    quality_best = nomination_lines(
        nominations["top_quality"],
        lambda item: f"{item['name']} — {item['quality_good_percent']} задач до 3 правок ({item['quality_good']} из {item['completed']})",
    )
    creators = nomination_lines(
        nominations["top_creators"],
        lambda item: f"{item['name']} — {item['count']} поставленных задач",
    )
    quiet = nomination_lines(
        nominations["top_quiet"],
        lambda item: f"{item['name']} — {item['messages']} сообщений за месяц",
    )

    text = f"""<b>🏆 Номинации за {month}</b>
<i>Не просто цифры, а сильные стороны команды.</i>

<b>🌟 Главный финишер</b>
{most_done}

<b>⚡ Самый быстрый ритм</b>
{fastest}

<b>⏱ Надёжность по срокам</b>
{deadline_best}

<b>🎯 Чистая сдача</b>
{quality_best}

<b>📨 Главный постановщик</b>
{creators}

<b>🤫 Тихий режим</b>
{quiet}"""
    save_stats_snapshot(month, "top", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def add_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(command_usage("add"))
        return
    username = context.args[0]
    with db() as conn:
        conn.execute("INSERT INTO designers(username,added_at,active) VALUES(?,?,1) ON CONFLICT(username) DO UPDATE SET active=1", (username, now_iso()))
    await update.message.reply_text(f"✅ Дизайнер {username} добавлен.")


async def remove_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(command_usage("remove"))
        return
    with db() as conn:
        conn.execute("UPDATE designers SET active=0 WHERE username=?", (context.args[0],))
    await update.message.reply_text(f"✅ Дизайнер {context.args[0]} убран из активных.")


async def designers_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with db() as conn:
        rows = conn.execute("SELECT username FROM designers WHERE active=1 ORDER BY username").fetchall()
    await update.message.reply_text("<b>👨‍🎨 ДИЗАЙНЕРЫ</b>\n\n" + ("\n".join(r["username"] for r in rows) or "—"), parse_mode=ParseMode.HTML)


def active_designers() -> List[str]:
    with db() as conn:
        return [r["username"] for r in conn.execute("SELECT username FROM designers WHERE active=1 ORDER BY username").fetchall()]


def base_shift_for(d: date) -> Tuple[Optional[str], Optional[str]]:
    designers = active_designers()
    if len(designers) != 2:
        return None, "Для графика 2/2 нужно добавить ровно двух активных дизайнеров."
    start_s = get_setting("shift_start_date")
    start_designer = get_setting("shift_start_designer")
    if not start_s or not start_designer:
        return None, "Старт графика не задан. Используйте /smena 01.08.2026 @designer"
    if start_designer not in designers:
        return None, "Стартовый дизайнер не найден среди активных дизайнеров."
    other = designers[0] if designers[1] == start_designer else designers[1]
    days = (d - parse_date(start_s)).days
    block = (days // 2) % 2
    return (start_designer if block == 0 else other), None


def shift_for(d: date) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    with db() as conn:
        over = conn.execute("SELECT * FROM shift_overrides WHERE date=?", (fmt_date(d),)).fetchone()
    if over:
        return over["designer"], "swap", over["reason"]
    designer, err = base_shift_for(d)
    return designer, None if not err else "error", err


async def smena_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text(command_usage("smena"))
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text(command_usage("smena", "Дата нужна в формате 01.08.2026."))
        return
    designer = context.args[1]
    if designer not in active_designers():
        await update.message.reply_text("❌ Этот дизайнер не добавлен в активные. Используйте /add @username")
        return
    set_setting("shift_start_date", fmt_date(d))
    set_setting("shift_start_designer", designer)
    await update.message.reply_text(f"✅ Старт графика 2/2 задан.\nДата: {fmt_date(d)}\nРаботает: {designer}")


async def online_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    arg = context.args[0].strip() if context.args else ""
    if arg.lower() == "week":
        start = now_msk().date()
        lines = ["<b>📅 ГРАФИК НА 7 ДНЕЙ</b>", "· · ·"]
        for i in range(7):
            d = start + timedelta(days=i)
            designer, mode, reason = shift_for(d)
            if mode == "error":
                await update.message.reply_text(f"❌ {reason}")
                return
            mark = " 🔄" if mode == "swap" else ""
            lines.append(f"{fmt_date(d)} — {designer}{mark}")
        await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)
        return

    if re.fullmatch(r"\d{2}\.\d{4}", arg):
        try:
            start = datetime.strptime(f"01.{arg}", DATE_FMT).date()
        except ValueError:
            await update.message.reply_text(command_usage("online", "Месяц нужен в формате 06.2026."))
            return
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        days = (next_month - start).days
        lines = [f"<b>📅 ГРАФИК НА МЕСЯЦ — {arg}</b>", "· · ·"]
        for i in range(days):
            d = start + timedelta(days=i)
            designer, mode, reason = shift_for(d)
            if mode == "error":
                await update.message.reply_text(f"❌ {reason}")
                return
            mark = " 🔄" if mode == "swap" else ""
            lines.append(f"{fmt_date(d)} — {designer}{mark}")
        await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)
        return

    if arg:
        try:
            d = parse_date(arg)
        except ValueError:
            await update.message.reply_text(command_usage("online", "Дата нужна в формате 05.08.2026, месяц 06.2026 или week."))
            return
    else:
        d = now_msk().date()

    designer, mode, reason = shift_for(d)
    if mode == "error":
        await update.message.reply_text(f"❌ {reason}")
        return
    next_d = d + timedelta(days=1)
    for _ in range(10):
        nd, nm, _ = shift_for(next_d)
        if nm != "error" and nd != designer:
            break
        next_d += timedelta(days=1)
    title = "Сегодня работает" if d == now_msk().date() else "В этот день работает"
    text = f"<b>👨‍🎨 {title}</b>\n\n{designer}\n\n📅 Дата: {fmt_date(d)}"
    if mode == "swap":
        text += f"\n\n<b>🔄 Подмена</b>\nПричина: {reason or '—'}"
    text += f"\n\n➡️ Следующая смена:\n{nd}\nс {fmt_date(next_d)}"
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def swap_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text(command_usage("swap"))
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text(command_usage("swap", "Дата нужна в формате 05.08.2026."))
        return
    designer = context.args[1]
    reason = " ".join(context.args[2:]) or "—"
    old, mode, err = shift_for(d)
    if mode == "error":
        await update.message.reply_text(f"❌ {err}")
        return
    with db() as conn:
        conn.execute("INSERT INTO shift_overrides(date,designer,reason,created_at,created_by) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET designer=excluded.designer, reason=excluded.reason, created_at=excluded.created_at, created_by=excluded.created_by", (fmt_date(d), designer, reason, now_iso(), user_name(update)))
    await update.message.reply_text(f"🔄 Подмена назначена.\n\nДата: {fmt_date(d)}\nВместо: {old}\nРаботает: {designer}\nПричина: {reason}")
    await send_log(context, update.effective_chat.id, f"<b>🔄 Назначена подмена</b>\nДата: {fmt_date(d)}\nВместо: {old}\nРаботает: {designer}\nПричина: {reason}")


async def clearswap_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(command_usage("clearswap"))
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text(command_usage("clearswap", "Дата нужна в формате 05.08.2026."))
        return
    with db() as conn:
        conn.execute("DELETE FROM shift_overrides WHERE date=?", (fmt_date(d),))
    await update.message.reply_text(f"↩️ Подмена на {fmt_date(d)} отменена. Возвращён стандартный график.")
    await send_log(context, update.effective_chat.id, f"<b>↩️ Подмена отменена</b>\nДата: {fmt_date(d)}\nВозвращён стандартный график.")


async def setlog_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    thread_id = update.message.message_thread_id
    if not thread_id:
        await update.message.reply_text("❌ Напишите /setlog внутри нужной темы Telegram-группы.")
        return
    set_setting(f"log_topic:{update.effective_chat.id}", str(thread_id))
    set_setting("log_chat_id", str(update.effective_chat.id))
    await update.message.reply_text("✅ Эта тема назначена логом задач.")


async def setreports_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    thread_id = update.message.message_thread_id
    if not thread_id:
        await update.message.reply_text("❌ Напишите /setreports внутри нужной темы Telegram-группы.")
        return
    set_setting(f"reports_topic:{update.effective_chat.id}", str(thread_id))
    set_setting("reports_chat_id", str(update.effective_chat.id))
    await update.message.reply_text("✅ Эта тема назначена темой отчётов.")


async def setdaily_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat = update.effective_chat
    if not chat:
        await update.message.reply_text("❌ Не удалось определить чат для утренних задач.")
        return
    thread_id = update.message.message_thread_id
    set_setting("daily_chat_id", str(chat.id))
    set_setting(f"daily_topic:{chat.id}", str(thread_id or ""))
    await update.message.reply_text("✅ Сюда будут приходить утренние задачи в 09:00 по Москве.")


async def fixquality_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit() or context.args[1] not in {"0", "1"}:
        await update.message.reply_text(command_usage("fixquality"))
        return
    task_id = int(context.args[0]); val = int(context.args[1])
    with db() as conn:
        conn.execute("UPDATE tasks SET quality_flag=? WHERE id=?", (val, task_id))
    log_action(task_id, "fixquality", user_name(update), str(val))
    await update.message.reply_text(f"✅ Качество задачи #{task_id} исправлено на {val}.")


async def fixdeadline_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit() or context.args[1] not in {"0", "1"}:
        await update.message.reply_text(command_usage("fixdeadline"))
        return
    task_id = int(context.args[0]); late = int(context.args[1])
    on_time = 0 if late else 1
    with db() as conn:
        conn.execute("UPDATE tasks SET on_time=? WHERE id=?", (on_time, task_id))
    log_action(task_id, "fixdeadline", user_name(update), f"late={late}")
    await update.message.reply_text(f"✅ Просрочка задачи #{task_id} исправлена. Просрочено: {'да' if late else 'нет'}.")


async def deadline_alert_job(context: ContextTypes.DEFAULT_TYPE):
    log_chat_id = get_log_chat_id()
    if not log_chat_id:
        return
    current_msk = now_msk()
    with db() as conn:
        rows = conn.execute(
            """
            SELECT t.*
            FROM tasks t
            LEFT JOIN deadline_alerts a ON a.task_id = t.id
            WHERE t.status != ? AND t.deadline < ? AND a.task_id IS NULL
            ORDER BY t.deadline ASC
            LIMIT 20
            """,
            (STATUSES["done"], current_msk.isoformat(timespec="seconds")),
        ).fetchall()
    if not rows:
        return

    topic = get_setting(f"log_topic:{log_chat_id}")
    for r in rows:
        notified_user = r["accepted_by"] or r["created_by"]
        responsible_line = f"Отметка: {html.escape(notified_user)}"
        if not r["accepted_by"]:
            responsible_line = f"Исполнитель не назначен.\nОтметка постановщика: {html.escape(notified_user)}"
        text = (
            f"<b>⛔ Срок нарушен по задаче #{r['id']}</b>\n\n"
            f"<b>{html.escape(r['title'])}</b>\n"
            f"Дедлайн: {fmt_dt(r['deadline'])}\n"
            f"Текущее время по Москве: {current_msk.strftime(DATETIME_FMT)}\n"
            f"Статус: {html.escape(r['status'])}\n"
            f"{responsible_line}"
        )
        try:
            await context.bot.send_message(
                chat_id=log_chat_id,
                message_thread_id=int(topic) if topic else None,
                text=text,
                parse_mode=ParseMode.HTML,
            )
            with db() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO deadline_alerts(task_id,alerted_at,notified_user) VALUES(?,?,?)",
                    (r["id"], now_iso(), notified_user),
                )
            log_action(r["id"], "deadline_overdue", notified_user, "deadline breached", r["status"], r["status"])
        except Exception as e:
            logger.warning("Deadline alert failed for task %s: %s", r["id"], e)


async def daily_tasks_job(context: ContextTypes.DEFAULT_TYPE):
    current_msk = now_msk()
    today = current_msk.date()
    chat_id = get_setting("daily_chat_id")
    if not chat_id:
        return
    topic = get_setting(f"daily_topic:{chat_id}")

    designer, mode, reason = shift_for(today)
    if mode == "error":
        await context.bot.send_message(
            chat_id=int(chat_id),
            message_thread_id=int(topic) if topic else None,
            text=f"❌ Не удалось собрать задачи на сегодня: {reason}",
        )
        return

    assigned_at = current_msk.isoformat(timespec="seconds")
    reassigned = []
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE status!=? ORDER BY deadline ASC",
            (STATUSES["done"],),
        ).fetchall()
        for row in rows:
            old = row["accepted_by"] or ""
            if user_key(old) == user_key(designer):
                continue
            new_status = STATUSES["in_progress"] if row["status"] == STATUSES["waiting"] else row["status"]
            conn.execute(
                """UPDATE tasks
                   SET accepted_by=?, accepted_at=COALESCE(accepted_at, ?), status=?
                   WHERE id=?""",
                (designer, assigned_at, new_status, row["id"]),
            )
            reassigned.append((row["id"], old or "—", new_status, row["status"]))

    for task_id, old, new_status, old_status in reassigned:
        log_action(
            task_id,
            "auto_reassign_shift",
            "system",
            f"{old} -> {designer}; date={fmt_date(today)}",
            old_status,
            new_status,
        )

    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE status!=? AND accepted_by=? ORDER BY deadline ASC",
            (STATUSES["done"], designer),
        ).fetchall()

    shift_note = " (подмена)" if mode == "swap" else ""
    lines = [
        f"<b>Доброе утро, {html.escape(designer)}!</b>",
        f"Сегодня твоя смена{shift_note}. Вот задачи на {fmt_date(today)}:",
    ]
    if reassigned:
        ids = ", ".join(f"#{task_id}" for task_id, *_ in reassigned)
        lines.append(f"Автоматически перенаправил на тебя: {ids}")

    if not rows:
        lines.append("\nАктивных задач на сегодня нет.")
    else:
        for row in rows:
            link = task_source_link(row["id"])
            link_text = f'<a href="{link}">открыть задачу</a>' if link else "ссылка не найдена"
            overdue = " · просрочен" if parse_iso_msk(row["deadline"]) < current_msk else ""
            lines.append(
                f"\n<b>#{row['id']} — {html.escape(row['title'])}</b>\n"
                f"От: {html.escape(row['created_by'])}\n"
                f"Дедлайн: {fmt_dt(row['deadline'])}{overdue}\n"
                f"Статус: {html.escape(row['status'])}\n"
                f"Ссылка: {link_text}"
            )

    await context.bot.send_message(
        chat_id=int(chat_id),
        message_thread_id=int(topic) if topic else None,
        text="\n".join(lines),
        parse_mode=ParseMode.HTML,
    )


async def meeting_reminders_job(context: ContextTypes.DEFAULT_TYPE):
    chat_id = get_setting("daily_chat_id")
    if not chat_id:
        return
    topic = get_setting(f"daily_topic:{chat_id}")
    current_msk = now_msk()

    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM meetings WHERE meeting_at>? AND (day_before_sent=0 OR two_hours_sent=0) ORDER BY meeting_at ASC",
            (current_msk.isoformat(timespec="seconds"),),
        ).fetchall()

    for row in rows:
        meeting_at = parse_iso_msk(row["meeting_at"])
        try:
            if not row["day_before_sent"]:
                day_before_at = datetime.combine(
                    meeting_at.date() - timedelta(days=1),
                    dt_time(hour=18, minute=0, tzinfo=MSK),
                )
                if current_msk.date() == day_before_at.date() and current_msk >= day_before_at:
                    await context.bot.send_message(
                        chat_id=int(chat_id),
                        message_thread_id=int(topic) if topic else None,
                        text=meeting_reminder_text(meeting_at, "day_before"),
                        parse_mode=ParseMode.HTML,
                    )
                    with db() as conn:
                        conn.execute("UPDATE meetings SET day_before_sent=1 WHERE id=?", (row["id"],))

            if not row["two_hours_sent"]:
                two_hours_at = meeting_at - timedelta(hours=2)
                if current_msk.date() == meeting_at.date() and current_msk >= two_hours_at:
                    await context.bot.send_message(
                        chat_id=int(chat_id),
                        message_thread_id=int(topic) if topic else None,
                        text=meeting_reminder_text(meeting_at, "two_hours"),
                        parse_mode=ParseMode.HTML,
                    )
                    with db() as conn:
                        conn.execute("UPDATE meetings SET two_hours_sent=1 WHERE id=?", (row["id"],))
        except Exception as e:
            logger.warning("Meeting reminder failed for meeting %s: %s", row["id"], e)


async def monthly_job(context: ContextTypes.DEFAULT_TYPE):
    if now_msk().day != 1:
        return
    month = previous_month()
    with db() as conn:
        sent = conn.execute("SELECT month FROM monthly_reports WHERE month=?", (month,)).fetchone()
    if sent:
        return
    chat_id = get_setting("reports_chat_id")
    if not chat_id:
        return
    topic = get_setting(f"reports_topic:{chat_id}")
    try:
        payload = report_payload(month)
        text = report_text(month, payload)
        await context.bot.send_message(chat_id=int(chat_id), message_thread_id=int(topic) if topic else None, text=text, parse_mode=ParseMode.HTML)
        save_stats_snapshot(month, "monthly_report", "system", payload, text)
        with db() as conn:
            conn.execute("INSERT INTO monthly_reports(month,sent_at) VALUES(?,?)", (month, now_iso()))
    except Exception as e:
        logger.warning("Monthly report failed: %s", e)


def logged_command_handler(name: str, fn) -> CommandHandler:
    async def wrapped(update: Update, context: ContextTypes.DEFAULT_TYPE):
        started_at = now_msk()
        action_id = log_command_start(name, update, context)
        try:
            await fn(update, context)
        except Exception as e:
            finish_command_log(action_id, "error", started_at, repr(e))
            raise
        finish_command_log(action_id, "ok", started_at)

    return CommandHandler(name, wrapped)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN не найден. Добавьте переменную окружения BOT_TOKEN.")
    init_db()
    app = Application.builder().token(BOT_TOKEN).post_init(setup_commands).build()

    handlers = [
        ("start", start), ("help", help_cmd), ("time", time_cmd), ("sobranie", sobranie_cmd),
        ("task", task_cmd), ("retask", retask_cmd), ("ok", ok_cmd), ("done", done_cmd), ("rework", rework_cmd), ("reassign", reassign_cmd),
        ("tasks", tasks_cmd),
        ("stats", stats_cmd), ("report", report_cmd), ("month_report", report_cmd), ("top", top_cmd), ("history", history_cmd),
        ("add", add_cmd), ("remove", remove_cmd), ("designers", designers_cmd),
        ("smena", smena_cmd), ("online", online_cmd), ("swap", swap_cmd), ("clearswap", clearswap_cmd),
        ("setlog", setlog_cmd), ("setreports", setreports_cmd), ("setdaily", setdaily_cmd),
        ("fixquality", fixquality_cmd), ("fixdeadline", fixdeadline_cmd),
    ]
    for name, fn in handlers:
        app.add_handler(logged_command_handler(name, fn))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, track_chat_message), group=1)
    if MessageReactionHandler:
        app.add_handler(MessageReactionHandler(reaction_accept_cmd))
    else:
        logger.warning("MessageReactionHandler is unavailable. Update python-telegram-bot to use task acceptance by reactions.")
    if not app.job_queue:
        raise RuntimeError("JobQueue не найден. Установите python-telegram-bot с поддержкой job-queue.")
    app.job_queue.scheduler.configure(timezone=MSK)
    app.job_queue.run_repeating(deadline_alert_job, interval=60 * 15, first=30)
    app.job_queue.run_repeating(meeting_reminders_job, interval=60 * 5, first=45)
    app.job_queue.run_daily(daily_tasks_job, time=dt_time(hour=9, minute=0, tzinfo=MSK))
    app.job_queue.run_repeating(monthly_job, interval=60 * 60 * 6, first=10)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
