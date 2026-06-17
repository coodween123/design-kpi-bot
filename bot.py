import os
import csv
import io
import json
import html
import re
import sqlite3
import zipfile
import logging
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict
from typing import Any, Optional, Tuple, List

from telegram import Update, BotCommand
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes

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
STATUSES = {
    "waiting": "ожидает принятия",
    "in_progress": "в работе",
    "rework": "на доработке",
    "done": "завершена",
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
        return None, None, None, "Пишите без запятых: Название 31.07.2026 18:00 Описание"
    match = TASK_BODY_RE.match(raw)
    if not match:
        return None, None, None, "Формат: Название 31.07.2026 18:00 Описание"
    title = match.group("title").strip()
    desc = match.group("desc").strip()
    if not title or not desc:
        return None, None, None, "Заполните название, дату, время и описание."
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


def html_quote_code(text: str) -> str:
    # Telegram blockquote + inline code. Works with HTML parse mode.
    import html
    return f"<blockquote><code>{html.escape(text)}</code></blockquote>"


def pct(part: int, total: int) -> str:
    return "0%" if total == 0 else f"{part / total * 100:.2f}%"


def human_duration(seconds: Optional[float]) -> str:
    if seconds is None:
        return "—"
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h} ч. {m:02d} мин."


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


def completed_rows(month: str, user: Optional[str] = None):
    q = "SELECT * FROM tasks WHERE status='завершена' AND completed_month=?"
    args = [month]
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


def stats_payload(month: str, personal_user: Optional[str] = None) -> dict[str, Any]:
    rows = completed_rows(month, personal_user)
    total_done = len(rows)
    ontime = sum(1 for r in rows if r["on_time"] == 1)
    late = sum(1 for r in rows if r["on_time"] == 0)
    quality_bad = sum(1 for r in rows if r["quality_flag"] == 1)
    quality_good = total_done - quality_bad
    avg_seconds = avg_completion(rows)

    with db() as conn:
        if personal_user:
            created = conn.execute(
                "SELECT COUNT(*) c FROM tasks WHERE created_month=? AND created_by=?",
                (month, personal_user),
            ).fetchone()["c"]
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
            created = conn.execute("SELECT COUNT(*) c FROM tasks WHERE created_month=?", (month,)).fetchone()["c"]
            active = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status!=?", (STATUSES["done"],)).fetchone()["c"]
            in_work = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=?", (STATUSES["in_progress"],)).fetchone()["c"]
            rework = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status=?", (STATUSES["rework"],)).fetchone()["c"]
            creator_rows = conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall()

    exec_top = Counter(r["accepted_by"] or "—" for r in rows).most_common(10)
    creator_top = Counter()
    if personal_user:
        creator_top[personal_user] = created
    else:
        for r in creator_rows:
            creator_top[r["created_by"]] += 1

    return {
        "month": month,
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
    exec_top = Counter(r["accepted_by"] or "—" for r in rows).most_common(10)
    with db() as conn:
        creators = Counter(r["created_by"] for r in conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall())
    return {
        "month": month,
        "timezone": TZ_NAME,
        "scope": "top",
        "top_executors": counter_payload(exec_top),
        "top_creators": counter_payload(creators.most_common(10)),
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
    "До 3 правок",
    "Более 3 правок",
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
        summary.append({
            "Дизайнер": designer,
            "Месяц": month,
            "Выполнено": len(items),
            "В срок": sum(1 for r in items if r["on_time"] == 1),
            "Просрочено": sum(1 for r in items if r["on_time"] == 0),
            "До 3 правок": sum(1 for r in items if r["quality_flag"] == 0),
            "Более 3 правок": sum(1 for r in items if r["quality_flag"] == 1),
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
    text = f"""
<b>🔷 Дизайнер Аны Мавричевой</b>

Система учёта задач, KPI-статистики и графика работы дизайнеров.

━━━━━━━━━━━━━━

<b>🚀 Основные команды</b>

🔷 /task — создать задачу

Пример:
{html_quote_code('/task Обложка 31.07.2026 18:00 сделать дизайн обложки')}

🔷 /retask — изменить задачу

Меняет задачу полностью: название, дату, время и описание.

Пример:
{html_quote_code('/retask 15 Новая обложка 31.07.2026 19:00 новое описание')}

🔷 /ok — взять задачу

Можно также поставить любую реакцию на сообщение бота о задаче — если реакцию ставит активный дизайнер, задача примется на него.

Пример:
{html_quote_code('/ok 15')}

🔷 /done — завершить задачу

<code>0</code> — до 3 правок
<code>1</code> — более 3 правок

Пример:
{html_quote_code('/done 15 0')}

🔷 /reassign — переназначить исполнителя

Пример:
{html_quote_code('/reassign 15 @anna')}

🔷 /rework — отправить на доработку

Пример:
{html_quote_code('/rework 15 Нужны правки')}

🔷 /tasks — активные задачи

🔷 /mytasks — мои задачи

🔷 /taskinfo — карточка задачи

Пример:
{html_quote_code('/taskinfo 15')}

━━━━━━━━━━━━━━

<b>👤 Личная статистика</b>

🔷 /me

Пример:
{html_quote_code('/me 07.2026')}

━━━━━━━━━━━━━━

<b>📊 Статистика команды</b>

🔷 /stats

🔷 /report

🔷 /top

🔷 /history — скачать историю выполненных задач

Примеры:
{html_quote_code('/history 07.2026')}
{html_quote_code('/history all @anna')}

━━━━━━━━━━━━━━

<b>📅 График работы</b>

🔷 /online

Пример:
{html_quote_code('/online 05.08.2026')}

🔷 /week

🔷 /time — текущее время по Москве

━━━━━━━━━━━━━━

<b>🔧 Админ-команды</b>

🔷 /adminhelp
""".strip()
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)

async def adminhelp_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = f"""
<b>🔧 АДМИН-КОМАНДЫ</b>

Технические команды для настройки бота.

━━━━━━━━━━━━━━

<b>👨‍🎨 Дизайнеры</b>

🔷 /adddesigner

Пример:
{html_quote_code('/adddesigner @username')}

🔷 /removedesigner

Пример:
{html_quote_code('/removedesigner @username')}

🔷 /designers

━━━━━━━━━━━━━━

<b>📅 График работы 2/2</b>

🔷 /setshiftstart

Пример:
{html_quote_code('/setshiftstart 01.08.2026 @george')}

🔷 /swap

Пример:
{html_quote_code('/swap 05.08.2026 @anna Подмена Георгия')}

🔷 /clearswap

Пример:
{html_quote_code('/clearswap 05.08.2026')}

━━━━━━━━━━━━━━

<b>📋 Настройка тем</b>

🔷 /setlog

🔷 /setreports

━━━━━━━━━━━━━━

<b>🛠 Исправление ошибок</b>

🔷 /fixquality

Пример:
{html_quote_code('/fixquality ID 0/1')}

🔷 /fixdeadline

Пример:
{html_quote_code('/fixdeadline ID 0/1')}
""".strip()
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)

async def setup_commands(app: Application):
    await app.bot.set_my_commands([
        BotCommand("help", "🔷 основная справка"),
        BotCommand("task", "🔷 создать задачу"),
        BotCommand("retask", "🔷 изменить задачу"),
        BotCommand("tasks", "🔷 активные задачи"),
        BotCommand("mytasks", "🔷 мои задачи"),
        BotCommand("me", "🔷 моя статистика"),
        BotCommand("stats", "🔷 статистика команды"),
        BotCommand("report", "🔷 месячный отчёт"),
        BotCommand("top", "🔷 рейтинг"),
        BotCommand("history", "🔷 история задач файлом"),
        BotCommand("online", "🔷 кто сегодня работает"),
        BotCommand("week", "🔷 график на 7 дней"),
        BotCommand("time", "🔷 время по Москве"),
        BotCommand("adminhelp", "🔷 технические команды"),
    ])


async def time_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"🕒 Сейчас по Москве: {now_msk().strftime(DATETIME_FMT)}")


async def history_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month, designer, error = parse_history_args(context.args or [])
    if error:
        await update.message.reply_text(f"❌ {error}\n\nПримеры:\n/history 07.2026\n/history all\n/history 07.2026 @anna")
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
        await update.message.reply_text(f"❌ {error}\nПример: /task Обложка 31.07.2026 18:00 сделать дизайн обложки")
        return
    if not title or not deadline or not desc:
        await update.message.reply_text("❌ Формат: /task Название 31.07.2026 18:00 Описание")
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
    reply_msg = await update.message.reply_text(f"✅ Задача #{task_id} создана. Статус: ожидает принятия.")
    remember_task_message(task_id, reply_msg, "task_reply")
    log_msg = await send_log(context, update.effective_chat.id, f"<b>✅ Создана задача #{task_id}</b>\n\n<b>{title}</b>\nДедлайн: {deadline.strftime(DATETIME_FMT)}\nАвтор: {creator}\n\n{desc}")
    remember_task_message(task_id, log_msg, "task_log")


async def retask_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.partition(" ")[2]
    task_id_s, sep, body = raw.partition(" ")
    if not sep or not task_id_s.isdigit():
        await update.message.reply_text(
            "❌ Формат: /retask ID Название 31.07.2026 18:00 Описание\n"
            "Пример: /retask 15 Новая обложка 31.07.2026 19:00 новое описание"
        )
        return

    task_id = int(task_id_s)
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return

    new_title, new_deadline, new_desc, error = parse_task_body(body)
    if error:
        await update.message.reply_text(f"❌ {error}\nПример: /retask 15 Новая обложка 31.07.2026 19:00 новое описание")
        return
    if not new_title or not new_deadline or not new_desc:
        await update.message.reply_text("❌ Формат: /retask ID Название 31.07.2026 18:00 Описание")
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
        await update.message.reply_text("❌ Формат: /ok ID")
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
        await update.message.reply_text("❌ Формат: /reassign ID @username")
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
        await update.message.reply_text(
            "❌ Формат: /done ID 0/1\n\n"
            "0 — до 3 правок\n"
            "1 — больше 3 правок\n\n"
            "Пример: /done 15 0"
        )
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
    if len(context.args) < 2 or not context.args[0].isdigit():
        await update.message.reply_text("❌ Формат: /rework ID Причина")
        return
    task_id = int(context.args[0])
    reason = " ".join(context.args[1:])
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    with db() as conn:
        conn.execute("UPDATE tasks SET status=?, rework_count=rework_count+1 WHERE id=?", (STATUSES["rework"], task_id))
    actor = user_name(update)
    log_action(task_id, "rework", actor, reason, row["status"], STATUSES["rework"])
    await update.message.reply_text(f"🟠 Задача #{task_id} отправлена на доработку.\nПричина: {reason}")
    await send_log(context, update.effective_chat.id, f"<b>🟠 Доработка задачи #{task_id}</b>\nПричина: {reason}\nКто отправил: {actor}")


async def tasks_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with db() as conn:
        rows = conn.execute("SELECT * FROM tasks WHERE status!='завершена' ORDER BY deadline ASC").fetchall()
    if not rows:
        await update.message.reply_text("✅ Активных задач нет.")
        return
    lines = ["<b>📋 АКТИВНЫЕ ЗАДАЧИ</b>", "━━━━━━━━━━━━━━"]
    current_msk = now_msk()
    for r in rows:
        deadline_note = "\nСрок: просрочен" if parse_iso_msk(r["deadline"]) < current_msk else ""
        lines.append(f"<b>#{r['id']} — {r['title']}</b>\nДедлайн: {fmt_dt(r['deadline'])}{deadline_note}\nСтатус: {r['status']}\nИсполнитель: {r['accepted_by'] or '—'}")
    await update.message.reply_text("\n\n".join(lines), parse_mode=ParseMode.HTML)


async def mytasks_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    me = user_name(update)
    with db() as conn:
        rows = conn.execute("SELECT * FROM tasks WHERE status!='завершена' AND accepted_by=? ORDER BY deadline ASC", (me,)).fetchall()
    if not rows:
        await update.message.reply_text("✅ У тебя нет активных задач.")
        return
    lines = ["<b>👤 МОИ ЗАДАЧИ</b>", "━━━━━━━━━━━━━━"]
    current_msk = now_msk()
    for r in rows:
        deadline_note = "\nСрок: просрочен" if parse_iso_msk(r["deadline"]) < current_msk else ""
        lines.append(f"<b>#{r['id']} — {r['title']}</b>\nДедлайн: {fmt_dt(r['deadline'])}{deadline_note}\nСтатус: {r['status']}")
    await update.message.reply_text("\n\n".join(lines), parse_mode=ParseMode.HTML)


async def taskinfo_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args or not context.args[0].isdigit():
        await update.message.reply_text("❌ Формат: /taskinfo ID")
        return
    r = task_by_id(int(context.args[0]))
    if not r:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    text = f"""
<b>📌 ЗАДАЧА #{r['id']}</b>

<b>{r['title']}</b>
{r['description'] or '—'}

━━━━━━━━━━━━━━

Автор: {r['created_by']}
Создана: {fmt_dt(r['created_at'])}
Исполнитель: {r['accepted_by'] or '—'}
Принята: {fmt_dt(r['accepted_at'])}
Дедлайн: {fmt_dt(r['deadline'])}
Завершена: {fmt_dt(r['completed_at'])}
Закрыл: {r['completed_by'] or '—'}
Статус: {r['status']}
Срок: {'в срок' if r['on_time'] == 1 else 'просрочен' if r['on_time'] == 0 else '—'}
Качество: {r['quality_flag'] if r['quality_flag'] is not None else '—'}
Доработок: {r['rework_count']}
""".strip()
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


def stats_text(month: str, personal_user: Optional[str] = None, payload: Optional[dict[str, Any]] = None) -> str:
    data = payload or stats_payload(month, personal_user)
    total_done = data["tasks"]["completed"]
    ontime = data["deadlines"]["on_time"]
    late = data["deadlines"]["late"]
    quality_bad = data["quality"]["bad"]
    quality_good = data["quality"]["good"]
    avg = data["efficiency"]["avg_completion"]
    if personal_user:
        return f"""
<b>👤 МОЯ СТАТИСТИКА — {month}</b>

━━━━━━━━━━━━━━

<b>📌 Задачи</b>
Выполнено задач: {total_done}

━━━━━━━━━━━━━━

<b>⏱ Сроки</b>
В срок: {ontime}
Просрочено: {late}
Процент просрочек: {pct(late, total_done)}

━━━━━━━━━━━━━━

<b>🎯 Качество</b>
До 3 правок: {quality_good}
Более 3 правок: {quality_bad}
Процент задач с правками: {pct(quality_bad, total_done)}

━━━━━━━━━━━━━━

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
<b>📊 СТАТИСТИКА — {month}</b>

━━━━━━━━━━━━━━

<b>📌 Задачи</b>
Создано задач: {created}
Завершено задач: {total_done}
Активных задач: {active}
В работе: {in_work}
На доработке: {rework}

━━━━━━━━━━━━━━

<b>⏱ Сроки</b>
В срок: {ontime}
Просрочено: {late}
Процент просрочек: {pct(late, total_done)}

━━━━━━━━━━━━━━

<b>🎯 Качество</b>
До 3 правок: {quality_good}
Более 3 правок: {quality_bad}
Процент задач с правками: {pct(quality_bad, total_done)}

━━━━━━━━━━━━━━

<b>⚡ Эффективность</b>
Среднее время выполнения: {avg}

━━━━━━━━━━━━━━

<b>🏆 Топ исполнителей</b>
{top_lines(exec_top)}

━━━━━━━━━━━━━━

<b>📨 Кто ставит больше задач</b>
{top_lines(creator_top)}
""".strip()


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    payload = stats_payload(month)
    text = stats_text(month, payload=payload)
    save_stats_snapshot(month, "team_stats", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def me_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    me = user_name(update)
    payload = stats_payload(month, me)
    text = stats_text(month, me, payload)
    save_stats_snapshot(month, "personal_stats", me, payload, text)
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
    return base.replace("<b>📊 СТАТИСТИКА", "<b>📈 ОТЧЁТ") + f"\n\n━━━━━━━━━━━━━━\n\n<b>👨‍🎨 Исполнители</b>\n" + ("\n\n".join(details) or "—") + f"\n\n━━━━━━━━━━━━━━\n\n<b>🏆 Лучший исполнитель месяца</b>\n{best} — {best_count} выполненных задач."


async def report_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    payload = report_payload(month)
    text = report_text(month, payload)
    save_stats_snapshot(month, "report", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def top_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    payload = top_payload(month)
    exec_top = [(item["name"], item["count"]) for item in payload["top_executors"]]
    creators = [(item["name"], item["count"]) for item in payload["top_creators"]]
    medals = ["🥇", "🥈", "🥉"]
    def lines(items):
        return "\n".join(f"{medals[i] if i < 3 else '•'} {n} — {c}" for i, (n, c) in enumerate(items)) or "—"
    text = f"<b>🏆 РЕЙТИНГ — {month}</b>\n\n━━━━━━━━━━━━━━\n\n<b>👨‍🎨 Исполнители</b>\n{lines(exec_top)}\n\n━━━━━━━━━━━━━━\n\n<b>📨 Постановщики</b>\n{lines(creators)}"
    save_stats_snapshot(month, "top", user_name(update), payload, text)
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def adddesigner_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Формат: /adddesigner @username")
        return
    username = context.args[0]
    with db() as conn:
        conn.execute("INSERT INTO designers(username,added_at,active) VALUES(?,?,1) ON CONFLICT(username) DO UPDATE SET active=1", (username, now_iso()))
    await update.message.reply_text(f"✅ Дизайнер {username} добавлен.")


async def removedesigner_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Формат: /removedesigner @username")
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
        return None, "Старт графика не задан. Используйте /setshiftstart 01.08.2026 @designer"
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


async def setshiftstart_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text("❌ Формат: /setshiftstart 01.08.2026 @designer")
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ Дата нужна в формате: 01.08.2026")
        return
    designer = context.args[1]
    if designer not in active_designers():
        await update.message.reply_text("❌ Этот дизайнер не добавлен в активные. Используйте /adddesigner @username")
        return
    set_setting("shift_start_date", fmt_date(d))
    set_setting("shift_start_designer", designer)
    await update.message.reply_text(f"✅ Старт графика 2/2 задан.\nДата: {fmt_date(d)}\nРаботает: {designer}")


async def online_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        d = parse_date(context.args[0]) if context.args else now_msk().date()
    except ValueError:
        await update.message.reply_text("❌ Дата нужна в формате: 05.08.2026")
        return
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
    text = f"<b>👨‍🎨 Сегодня работает</b>\n\n{designer}\n\n📅 Дата: {fmt_date(d)}"
    if mode == "swap":
        text += f"\n\n<b>🔄 Подмена</b>\nПричина: {reason or '—'}"
    text += f"\n\n➡️ Следующая смена:\n{nd}\nс {fmt_date(next_d)}"
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


async def week_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    start = now_msk().date()
    lines = ["<b>📅 ГРАФИК НА 7 ДНЕЙ</b>", "━━━━━━━━━━━━━━"]
    for i in range(7):
        d = start + timedelta(days=i)
        designer, mode, reason = shift_for(d)
        if mode == "error":
            await update.message.reply_text(f"❌ {reason}")
            return
        mark = " 🔄" if mode == "swap" else ""
        lines.append(f"{d.strftime('%d.%m')} — {designer}{mark}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def swap_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text("❌ Формат: /swap 05.08.2026 @anna Причина")
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ Дата нужна в формате: 05.08.2026")
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
        await update.message.reply_text("❌ Формат: /clearswap 05.08.2026")
        return
    try:
        d = parse_date(context.args[0])
    except ValueError:
        await update.message.reply_text("❌ Дата нужна в формате: 05.08.2026")
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


async def fixquality_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit() or context.args[1] not in {"0", "1"}:
        await update.message.reply_text("❌ Формат: /fixquality ID 0/1")
        return
    task_id = int(context.args[0]); val = int(context.args[1])
    with db() as conn:
        conn.execute("UPDATE tasks SET quality_flag=? WHERE id=?", (val, task_id))
    log_action(task_id, "fixquality", user_name(update), str(val))
    await update.message.reply_text(f"✅ Качество задачи #{task_id} исправлено на {val}.")


async def fixdeadline_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2 or not context.args[0].isdigit() or context.args[1] not in {"0", "1"}:
        await update.message.reply_text("❌ Формат: /fixdeadline ID 0/1")
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
        ("start", start), ("help", help_cmd), ("adminhelp", adminhelp_cmd), ("time", time_cmd),
        ("task", task_cmd), ("retask", retask_cmd), ("ok", ok_cmd), ("done", done_cmd), ("rework", rework_cmd), ("reassign", reassign_cmd),
        ("tasks", tasks_cmd), ("mytasks", mytasks_cmd), ("taskinfo", taskinfo_cmd),
        ("me", me_cmd), ("stats", stats_cmd), ("report", report_cmd), ("month_report", report_cmd), ("top", top_cmd), ("history", history_cmd),
        ("adddesigner", adddesigner_cmd), ("removedesigner", removedesigner_cmd), ("designers", designers_cmd),
        ("setshiftstart", setshiftstart_cmd), ("online", online_cmd), ("week", week_cmd), ("swap", swap_cmd), ("clearswap", clearswap_cmd),
        ("setlog", setlog_cmd), ("setreports", setreports_cmd),
        ("fixquality", fixquality_cmd), ("fixdeadline", fixdeadline_cmd),
    ]
    for name, fn in handlers:
        app.add_handler(logged_command_handler(name, fn))
    if MessageReactionHandler:
        app.add_handler(MessageReactionHandler(reaction_accept_cmd))
    else:
        logger.warning("MessageReactionHandler is unavailable. Update python-telegram-bot to use task acceptance by reactions.")
    if not app.job_queue:
        raise RuntimeError("JobQueue не найден. Установите python-telegram-bot с поддержкой job-queue.")
    app.job_queue.scheduler.configure(timezone=MSK)
    app.job_queue.run_repeating(deadline_alert_job, interval=60 * 15, first=30)
    app.job_queue.run_repeating(monthly_job, interval=60 * 60 * 6, first=10)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
