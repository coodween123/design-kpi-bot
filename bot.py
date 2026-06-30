import html
import io
import logging
import os
import sqlite3
import zipfile
from datetime import date, datetime, time as dt_time, timedelta
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)


APP_HOME = Path(os.getenv("KPI_BOT_HOME", Path.home() / "Documents" / "personal-kpi-bot")).expanduser()
DATA_DIR = Path(os.getenv("DATA_DIR", APP_HOME / "data")).expanduser()
DB_FILENAME = "personal_kpi_bot.sqlite3"
BOT_TOKEN = os.getenv("BOT_TOKEN")
OWNER_USER_ID = os.getenv("OWNER_USER_ID") or os.getenv("SLIV_OWNER_ID")

TZ_NAME = "Europe/Moscow"
MSK = ZoneInfo(TZ_NAME)
DATE_FMT = "%d.%m.%Y"
DATETIME_FMT = "%d.%m.%Y %H:%M"

KPI_DEADLINE_MAX = 10_000
KPI_QUALITY_MAX = 5_000
BASE_SALARY = 50_000
STATUS_DONE = "done"
STATUS_PENDING = "pending"

BTN_ADD = "➕ Добавить задачу"
BTN_KPI = "📊 KPI текущего месяца"
BTN_LATEST = "📋 Последние задачи"
BTN_EDIT = "✏️ Исправить / удалить"
BTN_EDIT_LEGACY = "✏️ Исправить запись"
BTN_DOWNLOAD = "📥 Скачать таблицу"

MAIN_MENU = ReplyKeyboardMarkup(
    [
        [BTN_ADD],
        [BTN_KPI, BTN_LATEST],
        [BTN_EDIT, BTN_DOWNLOAD],
    ],
    resize_keyboard=True,
)

MAIN_MENU_TEXTS = {BTN_ADD, BTN_KPI, BTN_LATEST, BTN_EDIT, BTN_EDIT_LEGACY, BTN_DOWNLOAD}

MONTHS_RU = {
    1: "январь",
    2: "февраль",
    3: "март",
    4: "апрель",
    5: "май",
    6: "июнь",
    7: "июль",
    8: "август",
    9: "сентябрь",
    10: "октябрь",
    11: "ноябрь",
    12: "декабрь",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def resolve_db_path() -> str:
    env_path = os.getenv("DB_PATH")
    if env_path:
        path = Path(env_path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        return str(path)
    ensure_dirs()
    return str(DATA_DIR / DB_FILENAME)


DB_PATH = resolve_db_path()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    if not table_exists(conn, table):
        return set()
    return {row["name"] for row in conn.execute(f'PRAGMA table_info("{table}")')}


def legacy_table_name(conn: sqlite3.Connection, table: str) -> str:
    stamp = datetime.now(MSK).strftime("%Y%m%d_%H%M%S")
    base_name = f"{table}_legacy_{stamp}"
    name = base_name
    counter = 1

    while table_exists(conn, name):
        name = f"{base_name}_{counter}"
        counter += 1

    return name


def archive_incompatible_table(
    conn: sqlite3.Connection,
    table: str,
    required_columns: set[str],
) -> None:
    if not table_exists(conn, table):
        return

    columns = table_columns(conn, table)
    missing_columns = required_columns - columns
    if not missing_columns:
        return

    legacy_name = legacy_table_name(conn, table)
    logger.warning(
        "Renaming incompatible table %s to %s. Missing columns: %s",
        table,
        legacy_name,
        ", ".join(sorted(missing_columns)),
    )
    conn.execute(f'ALTER TABLE "{table}" RENAME TO "{legacy_name}"')


def ensure_task_status_column(conn: sqlite3.Connection) -> None:
    if table_exists(conn, "tasks") and "status" not in table_columns(conn, "tasks"):
        conn.execute(f"ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT '{STATUS_DONE}'")


def init_db() -> None:
    with db() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        archive_incompatible_table(conn, "users", {"user_id", "chat_id", "created_at", "last_seen_at"})
        archive_incompatible_table(conn, "settings", {"key", "value"})
        archive_incompatible_table(
            conn,
            "tasks",
            {
                "user_id",
                "title",
                "completed_at",
                "completed_month",
                "on_time",
                "designer_fault_rework",
                "created_at",
                "updated_at",
            },
        )
        archive_incompatible_table(conn, "monthly_reports", {"user_id", "month", "sent_at"})
        conn.execute("DROP INDEX IF EXISTS idx_tasks_user_month")
        conn.execute("DROP INDEX IF EXISTS idx_tasks_user_completed_at")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                chat_id INTEGER NOT NULL,
                username TEXT,
                full_name TEXT,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                completed_month TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'done',
                on_time INTEGER NOT NULL,
                designer_fault_rework INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS monthly_reports (
                user_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                PRIMARY KEY(user_id, month)
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_user_month ON tasks(user_id, completed_month);
            CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_at ON tasks(user_id, completed_at);
            """
        )
        ensure_task_status_column(conn)


def now_msk() -> datetime:
    return datetime.now(MSK)


def now_iso() -> str:
    return now_msk().isoformat(timespec="seconds")


def parse_iso_msk(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt.astimezone(MSK) if dt.tzinfo else dt.replace(tzinfo=MSK)


def month_key(value: datetime | date) -> str:
    return value.strftime("%m.%Y")


def current_month() -> str:
    return month_key(now_msk())


def previous_month() -> str:
    first_day = now_msk().date().replace(day=1)
    return month_key(first_day - timedelta(days=1))


def month_label(month: str) -> str:
    month_num, year = month.split(".")
    return f"{MONTHS_RU[int(month_num)]} {year}"


def month_file_label(month: str) -> str:
    return month_label(month).replace(" ", "_")


def fmt_dt(value: datetime | str) -> str:
    dt = parse_iso_msk(value) if isinstance(value, str) else value.astimezone(MSK)
    return dt.strftime(DATETIME_FMT)


def money(value: int) -> str:
    return f"{value:,}".replace(",", " ") + " ₽"


def percent_value(part: int, total: int) -> float:
    return (part / total * 100) if total else 0.0


def percent_text(value: float) -> str:
    if abs(value - round(value)) < 0.005:
        return f"{int(round(value))}%"
    return f"{value:.2f}".replace(".", ",") + "%"


def ceil_div(value: int, divisor: int) -> int:
    if value <= 0:
        return 0
    return (value + divisor - 1) // divisor


def task_word(count: int) -> str:
    mod10 = count % 10
    mod100 = count % 100
    if mod10 == 1 and mod100 != 11:
        return "задачу"
    if 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
        return "задачи"
    return "задач"


def yes_no(value: bool) -> str:
    return "Да" if value else "Нет"


def user_full_name(user) -> str:
    parts = [user.first_name or "", user.last_name or ""]
    return " ".join(part for part in parts if part).strip() or str(user.id)


def upsert_user(update: Update) -> None:
    user = update.effective_user
    chat = update.effective_chat
    if not user or not chat:
        return
    stamp = now_iso()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO users(user_id, chat_id, username, full_name, created_at, last_seen_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
                chat_id=excluded.chat_id,
                username=excluded.username,
                full_name=excluded.full_name,
                last_seen_at=excluded.last_seen_at
            """,
            (user.id, chat.id, user.username or "", user_full_name(user), stamp, stamp),
        )
        conn.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('owner_user_id', ?)", (str(user.id),))


def get_setting(key: str) -> Optional[str]:
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def is_owner(user_id: int) -> bool:
    if OWNER_USER_ID:
        return str(user_id) == str(OWNER_USER_ID).strip()
    return str(user_id) == (get_setting("owner_user_id") or "")


def task_status(row) -> str:
    try:
        return row["status"] or STATUS_DONE
    except (KeyError, IndexError):
        return STATUS_DONE


def insert_task(
    user_id: int,
    title: str,
    completed_at: datetime,
    on_time: bool,
    fault_rework: bool,
    status: str = STATUS_DONE,
) -> int:
    stamp = now_iso()
    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO tasks(user_id,title,completed_at,completed_month,status,on_time,designer_fault_rework,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
            (
                user_id,
                title.strip(),
                completed_at.isoformat(timespec="seconds"),
                month_key(completed_at),
                status,
                1 if on_time else 0,
                1 if fault_rework else 0,
                stamp,
                stamp,
            ),
        )
        return int(cur.lastrowid)


def task_by_id(user_id: int, task_id: int):
    with db() as conn:
        return conn.execute("SELECT * FROM tasks WHERE user_id=? AND id=?", (user_id, task_id)).fetchone()


def delete_task(user_id: int, task_id: int):
    row = task_by_id(user_id, task_id)
    if not row:
        return None
    with db() as conn:
        conn.execute("DELETE FROM tasks WHERE user_id=? AND id=?", (user_id, task_id))
    return row


def update_task_field(user_id: int, task_id: int, **fields: Any) -> Optional[str]:
    row = task_by_id(user_id, task_id)
    if not row:
        return None
    updates = []
    args: list[Any] = []
    if "title" in fields:
        updates.append("title=?")
        args.append(fields["title"].strip())
    if "completed_at" in fields:
        completed_at = fields["completed_at"]
        updates.append("completed_at=?")
        args.append(completed_at.isoformat(timespec="seconds"))
        updates.append("completed_month=?")
        args.append(month_key(completed_at))
    if "status" in fields:
        updates.append("status=?")
        args.append(fields["status"])
    if "on_time" in fields:
        updates.append("on_time=?")
        args.append(1 if fields["on_time"] else 0)
    if "designer_fault_rework" in fields:
        updates.append("designer_fault_rework=?")
        args.append(1 if fields["designer_fault_rework"] else 0)
    if not updates:
        return row["completed_month"]
    updates.append("updated_at=?")
    args.append(now_iso())
    args.extend([user_id, task_id])
    with db() as conn:
        conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE user_id=? AND id=?", args)
    updated = task_by_id(user_id, task_id)
    return updated["completed_month"] if updated else row["completed_month"]


def tasks_for_month(user_id: int, month: str):
    with db() as conn:
        return conn.execute(
            """
            SELECT * FROM tasks
            WHERE user_id=? AND completed_month=? AND status=?
            ORDER BY completed_at ASC, id ASC
            """,
            (user_id, month, STATUS_DONE),
        ).fetchall()


def all_tasks(user_id: int):
    with db() as conn:
        return conn.execute(
            "SELECT * FROM tasks WHERE user_id=? AND status=? ORDER BY completed_at ASC, id ASC",
            (user_id, STATUS_DONE),
        ).fetchall()


def latest_tasks(user_id: int, limit: int = 10):
    with db() as conn:
        pending = conn.execute(
            """
            SELECT * FROM tasks
            WHERE user_id=? AND status=?
            ORDER BY completed_at DESC, id DESC
            """,
            (user_id, STATUS_PENDING),
        ).fetchall()
        done = conn.execute(
            """
            SELECT * FROM tasks
            WHERE user_id=? AND status=?
            ORDER BY completed_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, STATUS_DONE, limit),
        ).fetchall()
        return pending + done


def all_users():
    with db() as conn:
        return conn.execute("SELECT * FROM users ORDER BY user_id ASC").fetchall()


def months_with_tasks() -> list[str]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT completed_month
            FROM tasks
            WHERE status='done'
            ORDER BY substr(completed_month, 4, 4), substr(completed_month, 1, 2)
            """
        ).fetchall()
    return [row["completed_month"] for row in rows]


def user_report_name(user) -> str:
    if user["username"]:
        return f"@{user['username']}"
    if user["full_name"]:
        return user["full_name"]
    return f"id_{user['user_id']}"


def safe_filename_part(value: str) -> str:
    cleaned = (value or "unknown").strip().strip("@")
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in cleaned) or "unknown"


def month_folder(month: str) -> str:
    month_num, year = month.split(".")
    return f"{year}-{month_num}_{MONTHS_RU[int(month_num)]}"


def report_already_sent(user_id: int, month: str) -> bool:
    with db() as conn:
        return conn.execute("SELECT 1 FROM monthly_reports WHERE user_id=? AND month=?", (user_id, month)).fetchone() is not None


def mark_report_sent(user_id: int, month: str) -> None:
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO monthly_reports(user_id,month,sent_at) VALUES(?,?,?)",
            (user_id, month, now_iso()),
        )


def calc_kpi(rows) -> dict[str, Any]:
    done_rows = [row for row in rows if task_status(row) == STATUS_DONE]
    total = len(done_rows)
    on_time = sum(1 for row in done_rows if row["on_time"] == 1)
    late = sum(1 for row in done_rows if row["on_time"] == 0)
    fault = sum(1 for row in done_rows if row["designer_fault_rework"] == 1)
    on_time_pct = percent_value(on_time, total)
    late_pct = percent_value(late, total)
    fault_pct = percent_value(fault, total)

    deadline_kpi = 0
    quality_kpi = 0
    if total:
        if on_time_pct >= 99:
            deadline_kpi = KPI_DEADLINE_MAX
        elif on_time_pct >= 90:
            deadline_kpi = int(KPI_DEADLINE_MAX * 0.7)

        if fault_pct <= 3:
            quality_kpi = KPI_QUALITY_MAX
        elif fault_pct <= 10:
            quality_kpi = int(KPI_QUALITY_MAX * 0.5)

    return {
        "total": total,
        "on_time": on_time,
        "late": late,
        "fault": fault,
        "on_time_pct": on_time_pct,
        "late_pct": late_pct,
        "fault_pct": fault_pct,
        "deadline_kpi": deadline_kpi,
        "quality_kpi": quality_kpi,
        "total_kpi": deadline_kpi + quality_kpi,
        "base_salary": BASE_SALARY,
        "total_with_salary": BASE_SALARY + deadline_kpi + quality_kpi,
    }


def kpi_text(month: str, rows) -> str:
    stats = calc_kpi(rows)
    return (
        f"📊 <b>KPI за {html.escape(month_label(month))}</b>\n\n"
        f"Всего задач: <b>{stats['total']}</b>\n\n"
        f"В срок: <b>{stats['on_time']} из {stats['total']} — {percent_text(stats['on_time_pct'])}</b>\n"
        f"KPI за сроки: <b>{money(stats['deadline_kpi'])}</b>\n\n"
        f"С правками по твоей вине: <b>{stats['fault']} из {stats['total']} — {percent_text(stats['fault_pct'])}</b>\n"
        f"KPI за качество: <b>{money(stats['quality_kpi'])}</b>\n\n"
        f"KPI всего: <b>{money(stats['total_kpi'])}</b>\n"
        f"Оклад: <b>{money(stats['base_salary'])}</b>\n"
        f"<b>Итого с учетом оклада: {money(stats['total_with_salary'])}</b>"
    )


def month_progress_text(month: str, rows) -> str:
    stats = calc_kpi(rows)
    return (
        f"Всего задач за {html.escape(month_label(month))}: <b>{stats['total']}</b>\n"
        f"Выполнено в срок: <b>{stats['on_time']} — {percent_text(stats['on_time_pct'])}</b>\n"
        f"С правками по твоей вине: <b>{stats['fault']} — {percent_text(stats['fault_pct'])}</b>\n"
        f"KPI за месяц: <b>{money(stats['total_kpi'])}</b>\n"
        f"Итого с окладом: <b>{money(stats['total_with_salary'])}</b>\n\n"
        f"Excel можно скачать кнопкой «📥 Скачать таблицу»."
    )


def premium_warning_text(rows) -> str:
    stats = calc_kpi(rows)
    total = stats["total"]
    if not total:
        return ""

    deadline_needed = max(0, 99 * total - 100 * stats["on_time"])
    quality_needed = ceil_div(100 * stats["fault"] - 3 * total, 3)
    needed = max(deadline_needed, quality_needed)
    if needed <= 0:
        return ""

    risk_parts = []
    if deadline_needed:
        risk_parts.append(f"сроки {percent_text(stats['on_time_pct'])} при норме 99%")
    if quality_needed:
        risk_parts.append(f"правки {percent_text(stats['fault_pct'])} при лимите 3%")

    return (
        "\n\n⚠️ <b>KPI под риском.</b>\n"
        f"Сейчас: {', '.join(risk_parts)}.\n"
        f"Чтобы вернуться к полной премии, следующие <b>{needed}</b> {task_word(needed)} "
        f"нужно закрыть в срок и без правок по твоей вине."
    )


def saved_caption(month: str, rows) -> str:
    return f"✅ <b>Задача сохранена и внесена в таблицу.</b>\n\n{month_progress_text(month, rows)}{premium_warning_text(rows)}"


def updated_caption(task_id: int, month: str, rows) -> str:
    return f"✅ <b>Запись #{task_id} обновлена и внесена в таблицу.</b>\n\n{month_progress_text(month, rows)}{premium_warning_text(rows)}"


def monthly_caption(month: str, rows) -> str:
    stats = calc_kpi(rows)
    return (
        f"📊 <b>Итоговый отчет за {html.escape(month_label(month))}</b>\n\n"
        f"Всего выполнено задач: <b>{stats['total']}</b>\n\n"
        f"В срок: <b>{stats['on_time']} из {stats['total']} — {percent_text(stats['on_time_pct'])}</b>\n"
        f"KPI за сроки: <b>{money(stats['deadline_kpi'])}</b>\n\n"
        f"С правками по твоей вине: <b>{stats['fault']} из {stats['total']} — {percent_text(stats['fault_pct'])}</b>\n"
        f"KPI за качество: <b>{money(stats['quality_kpi'])}</b>\n\n"
        f"KPI всего: <b>{money(stats['total_kpi'])}</b>\n"
        f"Оклад: <b>{money(stats['base_salary'])}</b>\n"
        f"<b>Итого с учетом оклада: {money(stats['total_with_salary'])}</b>\n\n"
        f"Итоговая таблица прикреплена ниже."
    )


def latest_text(rows) -> str:
    if not rows:
        return "Пока нет сохраненных задач."
    lines = ["📋 <b>Последние задачи</b>"]

    pending_rows = [row for row in rows if task_status(row) == STATUS_PENDING]
    done_rows = [row for row in rows if task_status(row) == STATUS_DONE]

    if pending_rows:
        lines.append("\n⏳ <b>В ожидании</b>")
        for row in pending_rows:
            lines.append(
                "\n"
                f"<b>#{row['id']} — {html.escape(row['title'])}</b>\n"
                f"Добавлена: {fmt_dt(row['completed_at'])} МСК\n"
                "Статус: ждет обратную связь"
            )

    if done_rows:
        lines.append("\n✅ <b>Завершенные</b>")
    for row in done_rows:
        lines.append(
            "\n"
            f"<b>#{row['id']} — {html.escape(row['title'])}</b>\n"
            f"Дата: {fmt_dt(row['completed_at'])} МСК\n"
            f"В срок: {yes_no(row['on_time'] == 1)}\n"
            f"Правки по моей вине: {yes_no(row['designer_fault_rework'] == 1)}"
        )
    return "\n".join(lines)


def parse_user_datetime(text: str) -> Optional[datetime]:
    value = " ".join(text.strip().split())
    if not value:
        return None
    formats = [
        (DATETIME_FMT, None),
        (DATE_FMT, dt_time(hour=23, minute=59)),
        ("%H:%M", "today"),
    ]
    for fmt, fallback_time in formats:
        try:
            parsed = datetime.strptime(value, fmt)
        except ValueError:
            continue
        if fallback_time == "today":
            return datetime.combine(now_msk().date(), parsed.time(), tzinfo=MSK)
        if isinstance(fallback_time, dt_time):
            return datetime.combine(parsed.date(), fallback_time, tzinfo=MSK)
        return parsed.replace(tzinfo=MSK)
    return None


def draft_status(draft: dict[str, Any]) -> str:
    return draft.get("status") or STATUS_DONE


def set_draft_pending(draft: dict[str, Any]) -> dict[str, Any]:
    draft["status"] = STATUS_PENDING
    draft["completed_at"] = draft.get("completed_at") or now_iso()
    draft["on_time"] = draft.get("on_time", True)
    draft["designer_fault_rework"] = draft.get("designer_fault_rework", False)
    return draft


def draft_required_fields(draft: dict[str, Any]) -> set[str]:
    if draft_status(draft) == STATUS_PENDING:
        return {"title", "status", "completed_at"}
    return {"title", "on_time", "designer_fault_rework", "completed_at"}


def draft_review_text(draft: dict[str, Any]) -> str:
    completed_at = parse_iso_msk(draft["completed_at"]) if isinstance(draft.get("completed_at"), str) else draft.get("completed_at")
    if draft_status(draft) == STATUS_PENDING:
        return (
            "<b>Проверь запись</b>\n\n"
            f"Задача: {html.escape(draft.get('title', '—'))}\n"
            f"Добавлена: {fmt_dt(completed_at)} МСК\n"
            "Статус: в ожидании обратной связи"
        )
    return (
        "<b>Проверь запись</b>\n\n"
        f"Задача: {html.escape(draft.get('title', '—'))}\n"
        f"Дата выполнения: {fmt_dt(completed_at)} МСК\n"
        f"Выполнена в срок: {yes_no(bool(draft.get('on_time'))).lower()}\n"
        f"Правки по моей вине: {yes_no(bool(draft.get('designer_fault_rework'))).lower()}"
    )


def review_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("💾 Сохранить", callback_data="draft:save")],
            [InlineKeyboardButton("✏️ Исправить", callback_data="draft:edit")],
            [InlineKeyboardButton("❌ Отменить", callback_data="draft:cancel")],
        ]
    )


def update_review_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("💾 Сохранить изменения", callback_data="update:save")],
            [InlineKeyboardButton("✏️ Исправить", callback_data="update:edit")],
            [InlineKeyboardButton("❌ Отменить", callback_data="update:cancel")],
        ]
    )


def current_review_keyboard(context: ContextTypes.DEFAULT_TYPE) -> InlineKeyboardMarkup:
    return update_review_keyboard() if context.user_data.get("mode") == "update" else review_keyboard()


def draft_edit_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Название", callback_data="draft_edit:title")],
            [InlineKeyboardButton("Срок", callback_data="draft_edit:on_time")],
            [InlineKeyboardButton("Правки", callback_data="draft_edit:fault")],
            [InlineKeyboardButton("Дата выполнения", callback_data="draft_edit:date")],
            [InlineKeyboardButton("Назад", callback_data="draft:back")],
        ]
    )


def manage_entry_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("✏️ Редактировать", callback_data="manage:edit")],
            [InlineKeyboardButton("🗑 Удалить", callback_data="manage:delete")],
            [InlineKeyboardButton("Отмена", callback_data="manage:cancel")],
        ]
    )


def delete_confirm_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Удалить запись", callback_data=f"delete:confirm:{task_id}")],
            [InlineKeyboardButton("Оставить", callback_data="delete:cancel")],
        ]
    )


def bool_keyboard(prefix: str, yes_text: str = "✅ Да", no_text: str = "❌ Нет") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(yes_text, callback_data=f"{prefix}:1"),
                InlineKeyboardButton(no_text, callback_data=f"{prefix}:0"),
            ]
        ]
    )


def date_choice_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🕐 Сейчас", callback_data=f"{prefix}:now")],
            [InlineKeyboardButton("📅 Указать другую дату", callback_data=f"{prefix}:custom")],
        ]
    )


def status_choice_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("✅ Да", callback_data=f"{prefix}:1"),
                InlineKeyboardButton("❌ Нет", callback_data=f"{prefix}:0"),
            ],
            [InlineKeyboardButton("⏳ На рассмотрении", callback_data=f"{prefix}:pending")],
        ]
    )


def download_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Текущий месяц", callback_data="download:current")],
            [InlineKeyboardButton("Предыдущий месяц", callback_data="download:previous")],
            [InlineKeyboardButton("За все время", callback_data="download:all")],
        ]
    )


def col_letter(index: int) -> str:
    result = ""
    while index:
        index, rem = divmod(index - 1, 26)
        result = chr(65 + rem) + result
    return result


def xml_text(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=False)


def sheet_xml(rows: list[list[Any]]) -> str:
    row_xml = []
    for row_idx, row in enumerate(rows, start=1):
        cells = []
        for col_idx, value in enumerate(row, start=1):
            ref = f"{col_letter(col_idx)}{row_idx}"
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{xml_text(value)}</t></is></c>')
        row_xml.append(f'<row r="{row_idx}">{"".join(cells)}</row>')

    max_cols = max((len(row) for row in rows), default=0)
    col_xml = []
    for col_idx in range(1, max_cols + 1):
        max_len = max(
            (len(str(row[col_idx - 1])) for row in rows if len(row) >= col_idx and row[col_idx - 1] is not None),
            default=8,
        )
        width = min(max(max_len + 3, 10), 70)
        col_xml.append(f'<col min="{col_idx}" max="{col_idx}" width="{width}" customWidth="1"/>')
    cols_xml = f'<cols>{"".join(col_xml)}</cols>' if col_xml else ""

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'{cols_xml}<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def make_xlsx(summary_rows: list[list[Any]], task_rows: list[list[Any]]) -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        zf.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Итоги" sheetId="1" r:id="rId1"/>
    <sheet name="Задачи" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>""",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>""",
        )
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml(summary_rows))
        zf.writestr("xl/worksheets/sheet2.xml", sheet_xml(task_rows))
    archive.seek(0)
    return archive.getvalue()


def report_workbook(
    rows,
    month: Optional[str],
    all_time: bool = False,
    final: bool = False,
    filename_user: Optional[str] = None,
) -> tuple[bytes, str]:
    stats = calc_kpi(rows)
    summary_rows = [
        ["Показатель", "Количество", "Процент", "KPI"],
        ["Всего задач сделано", stats["total"], "100%" if stats["total"] else "0%", "—"],
        ["Выполнено в срок", stats["on_time"], percent_text(stats["on_time_pct"]), money(stats["deadline_kpi"])],
        ["Выполнено не в срок", stats["late"], percent_text(stats["late_pct"]), "—"],
        ["С правками по моей вине", stats["fault"], percent_text(stats["fault_pct"]), money(stats["quality_kpi"])],
        ["KPI всего", "—", "—", money(stats["total_kpi"])],
        ["Оклад", "—", "—", money(stats["base_salary"])],
        ["Итого с учетом оклада", "—", "—", money(stats["total_with_salary"])],
    ]
    summary_rows.extend(
        [
            [],
            ["Список выполненных задач"],
            ["№ задачи", "Задача", "Дата и время по МСК", "В срок?", "Были правки?"],
        ]
    )
    for row in rows:
        summary_rows.append(
            [
                row["id"],
                row["title"],
                fmt_dt(row["completed_at"]),
                yes_no(row["on_time"] == 1),
                yes_no(row["designer_fault_rework"] == 1),
            ]
        )

    task_rows = [["№ задачи", "Название задачи", "Дата и время по МСК", "В срок выполнено", "Правки по моей вине"]]
    for row in rows:
        task_rows.append(
            [
                row["id"],
                row["title"],
                fmt_dt(row["completed_at"]),
                yes_no(row["on_time"] == 1),
                yes_no(row["designer_fault_rework"] == 1),
            ]
        )

    data = make_xlsx(summary_rows, task_rows)
    if all_time:
        filename = "KPI_задачи_за_все_время.xlsx"
    elif final:
        filename = f"Итоговый_KPI_{month_file_label(month)}.xlsx"
    else:
        filename = f"KPI_задачи_{month_file_label(month)}.xlsx"
    if filename_user:
        filename = f"{safe_filename_part(filename_user)}_{filename}"
    return data, filename


def build_all_users_archive() -> tuple[bytes, str, int, int]:
    users = all_users()
    months = months_with_tasks()
    archive = io.BytesIO()
    file_count = 0
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for month in months:
            folder = month_folder(month)
            for user in users:
                rows = tasks_for_month(user["user_id"], month)
                if not rows:
                    continue
                display_name = user_report_name(user)
                data, filename = report_workbook(rows, month, filename_user=display_name)
                zf.writestr(f"{folder}/{filename}", data)
                file_count += 1
        if file_count == 0:
            zf.writestr("empty.txt", "Пока нет задач для общей выгрузки.")
    archive.seek(0)
    filename = f"sliv_kpi_reports_{now_msk().strftime('%Y-%m-%d_%H-%M')}.zip"
    return archive.getvalue(), filename, len(users), file_count


async def send_report_file(bot, chat_id: int, user_id: int, month: Optional[str], caption: str, all_time: bool = False, final: bool = False) -> None:
    rows = all_tasks(user_id) if all_time else tasks_for_month(user_id, month)
    data, filename = report_workbook(rows, month, all_time=all_time, final=final)
    file_obj = io.BytesIO(data)
    file_obj.name = filename
    await bot.send_document(
        chat_id=chat_id,
        document=file_obj,
        filename=filename,
        caption=caption,
        parse_mode=ParseMode.HTML,
    )


def draft_from_row(row) -> dict[str, Any]:
    return {
        "title": row["title"],
        "completed_at": row["completed_at"],
        "status": task_status(row),
        "on_time": row["on_time"] == 1,
        "designer_fault_rework": row["designer_fault_rework"] == 1,
    }


def apply_draft_to_task(user_id: int, task_id: int, draft: dict[str, Any]) -> Optional[str]:
    return update_task_field(
        user_id,
        task_id,
        title=draft["title"],
        completed_at=parse_iso_msk(draft["completed_at"]),
        status=draft.get("status", STATUS_DONE),
        on_time=bool(draft["on_time"]),
        designer_fault_rework=bool(draft["designer_fault_rework"]),
    )


async def start_add(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    context.user_data["state"] = "add_title"
    context.user_data["draft"] = {}
    await update.message.reply_text("Введите название выполненной задачи.", reply_markup=MAIN_MENU)


async def start_edit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    await update.message.reply_text(
        "Что сделать с записью?",
        reply_markup=manage_entry_keyboard(),
    )


async def start_full_edit(update: Update, context: ContextTypes.DEFAULT_TYPE, task_id: int) -> None:
    row = task_by_id(update.effective_user.id, task_id)
    if not row:
        await update.message.reply_text("Не нашел запись с таким номером.", reply_markup=MAIN_MENU)
        return
    context.user_data.clear()
    context.user_data["mode"] = "update"
    context.user_data["edit_task_id"] = task_id
    context.user_data["draft"] = draft_from_row(row)
    await update.message.reply_text(
        f"Обновляем запись #{task_id}. Заполним ее заново.\n\nВведите новое название задачи.",
        reply_markup=MAIN_MENU,
    )
    context.user_data["state"] = "update_title"


async def start_download(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    await update.message.reply_text("Какую таблицу скачать?", reply_markup=download_keyboard())


async def show_current_kpi(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    month = current_month()
    rows = tasks_for_month(update.effective_user.id, month)
    await update.message.reply_text(kpi_text(month, rows), parse_mode=ParseMode.HTML, reply_markup=MAIN_MENU)


async def show_latest(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    rows = latest_tasks(update.effective_user.id)
    await update.message.reply_text(latest_text(rows), parse_mode=ParseMode.HTML, reply_markup=MAIN_MENU)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    context.user_data.clear()
    await update.message.reply_text(
        "Привет! Здесь можно вести личный учет выполненных задач и KPI.\n\n"
        "Добавляй задачи кнопкой ниже, а Excel-таблицу можно скачать по запросу.",
        reply_markup=MAIN_MENU,
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    await update.message.reply_text(
        "<b>Команды</b>\n\n"
        "/start — открыть меню\n"
        "/add — добавить задачу\n"
        "/kpi — KPI текущего месяца\n"
        "/latest — последние задачи\n"
        "/edit — исправить или удалить запись\n"
        "/edit ID — полностью обновить запись по номеру\n"
        "/download — скачать таблицу",
        parse_mode=ParseMode.HTML,
        reply_markup=MAIN_MENU,
    )


async def add_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    await start_add(update, context)


async def kpi_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    await show_current_kpi(update, context)


async def latest_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    await show_latest(update, context)


async def edit_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    if context.args and context.args[0].isdigit():
        await start_full_edit(update, context, int(context.args[0]))
        return
    await start_edit(update, context)


async def sliv_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    if not is_owner(update.effective_user.id):
        await update.message.reply_text("Команда недоступна.")
        return
    data, filename, user_count, file_count = build_all_users_archive()
    file_obj = io.BytesIO(data)
    file_obj.name = filename
    await update.message.reply_document(
        document=file_obj,
        filename=filename,
        caption=f"Готово. Пользователей в базе: {user_count}. Файлов отчетов: {file_count}.",
    )


async def download_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    await start_download(update, context)


async def setup_commands(app: Application) -> None:
    await app.bot.delete_my_commands()
    await app.bot.set_my_commands(
        [
            BotCommand("start", "открыть меню"),
            BotCommand("add", "добавить выполненную задачу"),
            BotCommand("kpi", "KPI текущего месяца"),
            BotCommand("latest", "последние задачи"),
            BotCommand("edit", "исправить или удалить запись"),
            BotCommand("download", "скачать таблицу"),
            BotCommand("help", "помощь"),
        ]
    )


async def process_add_title(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    if len(text.strip()) < 2:
        await update.message.reply_text("Название слишком короткое. Напишите название задачи текстом.")
        return
    context.user_data["draft"] = {"title": text.strip()}
    context.user_data["state"] = None
    await update.message.reply_text(
        "Выполнена в срок?",
        reply_markup=status_choice_keyboard("add_on_time"),
    )


async def process_update_title(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    if len(text.strip()) < 2:
        await update.message.reply_text("Название слишком короткое. Напишите название задачи текстом.")
        return
    draft = context.user_data.get("draft", {})
    draft["title"] = text.strip()
    context.user_data["draft"] = draft
    context.user_data["state"] = None
    await update.message.reply_text("Выполнена в срок?", reply_markup=status_choice_keyboard("update_on_time"))


async def process_add_date(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    dt = parse_user_datetime(text)
    if not dt:
        await update.message.reply_text("Не понял дату. Напишите так: 20.06.2026 18:45")
        return
    draft = context.user_data.get("draft", {})
    draft["completed_at"] = dt.isoformat(timespec="seconds")
    context.user_data["draft"] = draft
    context.user_data["state"] = None
    await update.message.reply_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))


async def process_update_date(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    dt = parse_user_datetime(text)
    if not dt:
        await update.message.reply_text("Не понял дату. Напишите так: 20.06.2026 18:45")
        return
    draft = context.user_data.get("draft", {})
    draft["completed_at"] = dt.isoformat(timespec="seconds")
    context.user_data["draft"] = draft
    context.user_data["state"] = None
    await update.message.reply_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=update_review_keyboard())


async def process_draft_title(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    draft = context.user_data.get("draft", {})
    if not draft:
        await start_add(update, context)
        return
    draft["title"] = text.strip()
    context.user_data["draft"] = draft
    context.user_data["state"] = None
    await update.message.reply_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))


async def process_edit_id(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    if not text.strip().isdigit():
        await update.message.reply_text("Напишите номер записи цифрой.")
        return
    await start_full_edit(update, context, int(text.strip()))


async def process_delete_id(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    if not text.strip().isdigit():
        await update.message.reply_text("Напишите номер записи цифрой.")
        return

    task_id = int(text.strip())
    row = task_by_id(update.effective_user.id, task_id)
    if not row:
        await update.message.reply_text("Не нашел запись с таким номером.", reply_markup=MAIN_MENU)
        return

    context.user_data["delete_task_id"] = task_id
    await update.message.reply_text(
        (
            f"Удалить запись #{task_id}?\n\n"
            f"Задача: {html.escape(row['title'])}\n"
            f"Дата: {fmt_dt(row['completed_at'])}\n\n"
            "Действие нельзя отменить."
        ),
        parse_mode=ParseMode.HTML,
        reply_markup=delete_confirm_keyboard(task_id),
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    text = (update.message.text or "").strip()

    if text in MAIN_MENU_TEXTS:
        if text == BTN_ADD:
            await start_add(update, context)
        elif text == BTN_KPI:
            context.user_data.clear()
            await show_current_kpi(update, context)
        elif text == BTN_LATEST:
            context.user_data.clear()
            await show_latest(update, context)
        elif text in {BTN_EDIT, BTN_EDIT_LEGACY}:
            await start_edit(update, context)
        elif text == BTN_DOWNLOAD:
            context.user_data.clear()
            await start_download(update, context)
        return

    state = context.user_data.get("state")

    if state == "add_title":
        await process_add_title(update, context, text)
        return
    if state == "update_title":
        await process_update_title(update, context, text)
        return
    if state == "add_date":
        await process_add_date(update, context, text)
        return
    if state == "update_date":
        await process_update_date(update, context, text)
        return
    if state == "draft_title":
        await process_draft_title(update, context, text)
        return
    if state == "draft_date":
        if context.user_data.get("mode") == "update":
            await process_update_date(update, context, text)
        else:
            await process_add_date(update, context, text)
        return
    if state == "edit_id":
        await process_edit_id(update, context, text)
        return
    if state == "delete_id":
        await process_delete_id(update, context, text)
        return

    await update.message.reply_text("Выберите действие в меню ниже.", reply_markup=MAIN_MENU)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    upsert_user(update)
    query = update.callback_query
    await query.answer()
    data = query.data or ""
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    if data == "manage:edit":
        context.user_data.clear()
        context.user_data["state"] = "edit_id"
        rows = latest_tasks(user_id, 5)
        await query.edit_message_text(
            latest_text(rows) + "\n\nВведите номер записи, которую нужно исправить.",
            parse_mode=ParseMode.HTML,
        )
        return

    if data == "manage:delete":
        context.user_data.clear()
        context.user_data["state"] = "delete_id"
        rows = latest_tasks(user_id, 5)
        await query.edit_message_text(
            latest_text(rows) + "\n\nВведите номер записи, которую нужно удалить.",
            parse_mode=ParseMode.HTML,
        )
        return

    if data == "manage:cancel":
        context.user_data.clear()
        await query.edit_message_text("Хорошо, ничего не меняем.")
        return

    if data.startswith("delete:confirm:"):
        task_id = int(data.rsplit(":", 1)[1])
        pending_task_id = context.user_data.get("delete_task_id")
        if pending_task_id != task_id:
            context.user_data.clear()
            await query.edit_message_text("Удаление уже не активно. Если нужно удалить запись, начните заново.")
            return

        row = delete_task(user_id, task_id)
        context.user_data.clear()
        if not row:
            await query.edit_message_text("Запись уже не найдена.")
            return

        month = row["completed_month"]
        rows = tasks_for_month(user_id, month)
        await query.edit_message_text(
            f"Запись #{task_id} удалена.\n\n{month_progress_text(month, rows)}{premium_warning_text(rows)}",
            parse_mode=ParseMode.HTML,
        )
        return

    if data == "delete:cancel":
        context.user_data.clear()
        await query.edit_message_text("Удаление отменено.")
        return

    if data.startswith("add_on_time:"):
        draft = context.user_data.get("draft", {})
        if data.endswith(":pending"):
            draft = set_draft_pending(draft)
            context.user_data["draft"] = draft
            await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=review_keyboard())
            return
        draft["status"] = STATUS_DONE
        draft["on_time"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text(
            "Были правки по моей вине?",
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("✅ Нет", callback_data="add_fault:0"),
                        InlineKeyboardButton("❌ Да", callback_data="add_fault:1"),
                    ]
                ]
            ),
        )
        return

    if data.startswith("update_on_time:"):
        draft = context.user_data.get("draft", {})
        if data.endswith(":pending"):
            draft = set_draft_pending(draft)
            context.user_data["draft"] = draft
            await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=update_review_keyboard())
            return
        draft["status"] = STATUS_DONE
        draft["on_time"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text(
            "Были правки по моей вине?",
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("✅ Нет", callback_data="update_fault:0"),
                        InlineKeyboardButton("❌ Да", callback_data="update_fault:1"),
                    ]
                ]
            ),
        )
        return

    if data.startswith("add_fault:"):
        draft = context.user_data.get("draft", {})
        draft["designer_fault_rework"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text("Когда задача была выполнена?", reply_markup=date_choice_keyboard("add_date"))
        return

    if data.startswith("update_fault:"):
        draft = context.user_data.get("draft", {})
        draft["designer_fault_rework"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text("Когда задача была выполнена?", reply_markup=date_choice_keyboard("update_date"))
        return

    if data == "add_date:now":
        draft = context.user_data.get("draft", {})
        draft["completed_at"] = now_iso()
        context.user_data["draft"] = draft
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=review_keyboard())
        return

    if data == "add_date:custom":
        context.user_data["state"] = "add_date"
        await query.edit_message_text("Напишите дату и время выполнения по МСК.\nНапример: 20.06.2026 18:45")
        return

    if data == "update_date:now":
        draft = context.user_data.get("draft", {})
        draft["completed_at"] = now_iso()
        context.user_data["draft"] = draft
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=update_review_keyboard())
        return

    if data == "update_date:custom":
        context.user_data["state"] = "update_date"
        await query.edit_message_text("Напишите дату и время выполнения по МСК.\nНапример: 20.06.2026 18:45")
        return

    if data == "draft:save":
        draft = context.user_data.get("draft", {})
        required = draft_required_fields(draft)
        if not required.issubset(draft):
            await query.edit_message_text("Не все поля заполнены. Начните добавление заново.", reply_markup=None)
            context.user_data.clear()
            return
        completed_at = parse_iso_msk(draft["completed_at"])
        task_id = insert_task(
            user_id,
            draft["title"],
            completed_at,
            bool(draft.get("on_time", True)),
            bool(draft.get("designer_fault_rework", False)),
            draft_status(draft),
        )
        context.user_data.clear()
        if draft_status(draft) == STATUS_PENDING:
            await query.edit_message_text(
                (
                    f"⏳ <b>Задача #{task_id} добавлена в ожидание.</b>\n\n"
                    "Она появится в «Последних задачах» в отдельной категории и пока не участвует в KPI. "
                    "Когда будет обратная связь, открой «Исправить / удалить» и заверши запись."
                ),
                parse_mode=ParseMode.HTML,
            )
            return
        month = month_key(completed_at)
        rows = tasks_for_month(user_id, month)
        await query.edit_message_text(saved_caption(month, rows), parse_mode=ParseMode.HTML)
        return

    if data == "draft:cancel":
        context.user_data.clear()
        await query.edit_message_text("Добавление отменено.")
        return

    if data == "update:save":
        task_id = context.user_data.get("edit_task_id")
        draft = context.user_data.get("draft", {})
        required = draft_required_fields(draft)
        if not task_id or not required.issubset(draft):
            context.user_data.clear()
            await query.edit_message_text("Не все поля заполнены. Начните обновление заново.")
            return
        month = apply_draft_to_task(user_id, int(task_id), draft)
        context.user_data.clear()
        if not month:
            await query.edit_message_text("Запись уже не найдена.")
            return
        if draft_status(draft) == STATUS_PENDING:
            await query.edit_message_text(
                (
                    f"⏳ <b>Запись #{int(task_id)} обновлена и оставлена в ожидании.</b>\n\n"
                    "В KPI она пока не участвует. Когда появится обратная связь, можно снова открыть запись и закрыть её."
                ),
                parse_mode=ParseMode.HTML,
            )
            return
        rows = tasks_for_month(user_id, month)
        await query.edit_message_text(
            updated_caption(int(task_id), month, rows),
            parse_mode=ParseMode.HTML,
        )
        return

    if data == "update:cancel":
        context.user_data.clear()
        await query.edit_message_text("Обновление отменено.")
        return

    if data == "update:edit":
        await query.edit_message_text("Что исправить?", reply_markup=draft_edit_keyboard())
        context.user_data["mode"] = "update"
        return

    if data == "draft:edit":
        await query.edit_message_text("Что исправить?", reply_markup=draft_edit_keyboard())
        return

    if data == "draft:back":
        draft = context.user_data.get("draft", {})
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))
        return

    if data == "draft_edit:title":
        context.user_data["state"] = "draft_title"
        await query.edit_message_text("Введите новое название задачи.")
        return

    if data == "draft_edit:on_time":
        await query.edit_message_text("Выполнена в срок?", reply_markup=status_choice_keyboard("draft_set_on_time"))
        return

    if data == "draft_edit:fault":
        await query.edit_message_text(
            "Были правки по моей вине?",
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("✅ Нет", callback_data="draft_set_fault:0"),
                        InlineKeyboardButton("❌ Да", callback_data="draft_set_fault:1"),
                    ]
                ]
            ),
        )
        return

    if data == "draft_edit:date":
        await query.edit_message_text("Когда задача была выполнена?", reply_markup=date_choice_keyboard("draft_set_date"))
        return

    if data.startswith("draft_set_on_time:"):
        draft = context.user_data.get("draft", {})
        if data.endswith(":pending"):
            draft = set_draft_pending(draft)
            context.user_data["draft"] = draft
            await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))
            return
        draft["status"] = STATUS_DONE
        draft["on_time"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))
        return

    if data.startswith("draft_set_fault:"):
        draft = context.user_data.get("draft", {})
        draft["designer_fault_rework"] = data.endswith(":1")
        context.user_data["draft"] = draft
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))
        return

    if data == "draft_set_date:now":
        draft = context.user_data.get("draft", {})
        draft["completed_at"] = now_iso()
        context.user_data["draft"] = draft
        await query.edit_message_text(draft_review_text(draft), parse_mode=ParseMode.HTML, reply_markup=current_review_keyboard(context))
        return

    if data == "draft_set_date:custom":
        context.user_data["state"] = "draft_date"
        await query.edit_message_text("Напишите дату и время выполнения по МСК.\nНапример: 20.06.2026 18:45")
        return

    if data.startswith("download:"):
        mode = data.split(":", 1)[1]
        if mode == "current":
            month = current_month()
            rows = tasks_for_month(user_id, month)
            await send_report_file(context.bot, chat_id, user_id, month, kpi_text(month, rows))
        elif mode == "previous":
            month = previous_month()
            rows = tasks_for_month(user_id, month)
            await send_report_file(context.bot, chat_id, user_id, month, kpi_text(month, rows))
        else:
            rows = all_tasks(user_id)
            await send_report_file(context.bot, chat_id, user_id, None, "📥 Таблица за все время.", all_time=True)
        return


async def monthly_report_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    if now_msk().day != 1:
        return
    month = previous_month()
    for user in all_users():
        user_id = user["user_id"]
        if report_already_sent(user_id, month):
            continue
        rows = tasks_for_month(user_id, month)
        try:
            await send_report_file(
                context.bot,
                user["chat_id"],
                user_id,
                month,
                monthly_caption(month, rows),
                final=True,
            )
            mark_report_sent(user_id, month)
        except Exception as e:
            logger.warning("Cannot send monthly report to %s: %s", user_id, e)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN не найден. Добавьте переменную окружения BOT_TOKEN.")
    init_db()
    app = Application.builder().token(BOT_TOKEN).post_init(setup_commands).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("add", add_cmd))
    app.add_handler(CommandHandler("kpi", kpi_cmd))
    app.add_handler(CommandHandler("latest", latest_cmd))
    app.add_handler(CommandHandler("edit", edit_cmd))
    app.add_handler(CommandHandler("download", download_cmd))
    app.add_handler(CommandHandler("sliv", sliv_cmd))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    if app.job_queue:
        app.job_queue.scheduler.configure(timezone=MSK)
        app.job_queue.run_daily(monthly_report_job, time=dt_time(hour=6, minute=0, tzinfo=MSK))
    else:
        logger.warning("JobQueue недоступен, автоматический месячный отчет не запустится.")

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
