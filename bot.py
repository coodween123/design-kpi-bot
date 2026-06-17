import os
import sqlite3
import logging
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict
from typing import Optional, Tuple, List

from telegram import Update, BotCommand
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes

DB_PATH = os.getenv("DB_PATH", "design_kpi_bot.sqlite3")
BOT_TOKEN = os.getenv("BOT_TOKEN")
DATE_FMT = "%d.%m.%Y"
DATETIME_FMT = "%d.%m.%Y %H:%M"
MSK = ZoneInfo("Europe/Moscow")
STATUSES = {
    "waiting": "ожидает принятия",
    "in_progress": "в работе",
    "rework": "на доработке",
    "done": "завершена",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(MSK).isoformat(timespec="seconds")


def parse_dt(value: str) -> datetime:
    return datetime.strptime(value.strip(), DATETIME_FMT).replace(tzinfo=MSK)


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), DATE_FMT).date()


def month_key(dt: datetime | date) -> str:
    return dt.strftime("%m.%Y")


def current_month() -> str:
    return datetime.now(MSK).strftime("%m.%Y")


def previous_month() -> str:
    first = datetime.now(MSK).date().replace(day=1)
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
    return dt if dt.tzinfo else dt.replace(tzinfo=MSK)


def user_name(update: Update) -> str:
    u = update.effective_user
    if not u:
        return "unknown"
    return f"@{u.username}" if u.username else f"id:{u.id}"


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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
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

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_completed_month ON tasks(completed_month);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_month ON tasks(created_month);
        CREATE INDEX IF NOT EXISTS idx_tasks_accepted_by ON tasks(accepted_by);
        """)


def set_setting(key: str, value: str) -> None:
    with db() as conn:
        conn.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


def get_setting(key: str) -> Optional[str]:
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def log_action(task_id: Optional[int], action: str, user: str, comment: str = "", old_status: str = "", new_status: str = "") -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO task_log(created_at,task_id,action,user,comment,old_status,new_status) VALUES(?,?,?,?,?,?,?)",
            (now_iso(), task_id, action, user, comment, old_status, new_status),
        )


async def send_log(context: ContextTypes.DEFAULT_TYPE, chat_id: int, text: str) -> None:
    topic = get_setting(f"log_topic:{chat_id}")
    try:
        await context.bot.send_message(
            chat_id=chat_id,
            message_thread_id=int(topic) if topic else None,
            text=text,
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.warning("Cannot send log: %s", e)


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
{html_quote_code('/task Баннер VK | 31.07.2026 18:00 | Сделать баннер для рекламы курса')}

🔷 /ok — взять задачу

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

━━━━━━━━━━━━━━

<b>📅 График работы</b>

🔷 /online

Пример:
{html_quote_code('/online 05.08.2026')}

🔷 /week

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
        BotCommand("tasks", "🔷 активные задачи"),
        BotCommand("mytasks", "🔷 мои задачи"),
        BotCommand("me", "🔷 моя статистика"),
        BotCommand("stats", "🔷 статистика команды"),
        BotCommand("report", "🔷 месячный отчёт"),
        BotCommand("top", "🔷 рейтинг"),
        BotCommand("online", "🔷 кто сегодня работает"),
        BotCommand("week", "🔷 график на 7 дней"),
        BotCommand("adminhelp", "🔷 технические команды"),
    ])

async def task_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.partition(" ")[2]
    parts = [p.strip() for p in raw.split("|", 2)]
    if len(parts) != 3:
        await update.message.reply_text("❌ Формат: /task Название | 31.07.2026 18:00 | Описание")
        return
    title, deadline_s, desc = parts
    try:
        deadline = parse_dt(deadline_s)
    except ValueError:
        await update.message.reply_text("❌ Дедлайн нужен в формате: 31.07.2026 18:00")
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
    await update.message.reply_text(f"✅ Задача #{task_id} создана. Статус: ожидает принятия.")
    await send_log(context, update.effective_chat.id, f"<b>✅ Создана задача #{task_id}</b>\n\n<b>{title}</b>\nДедлайн: {deadline.strftime(DATETIME_FMT)}\nАвтор: {creator}\n\n{desc}")


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
        await update.message.reply_text("❌ Формат: /done ID 0/1")
        return
    task_id = int(context.args[0])
    qflag = int(context.args[1])
    row = task_by_id(task_id)
    if not row:
        await update.message.reply_text("❌ Задача не найдена.")
        return
    completed_at = datetime.now(MSK)
    deadline = parse_iso_msk(row["deadline"])
    on_time = 1 if completed_at <= deadline else 0
    actor = user_name(update)
    with db() as conn:
        conn.execute(
            """UPDATE tasks SET completed_by=?, completed_at=?, status=?, quality_flag=?, on_time=?, completed_month=? WHERE id=?""",
            (actor, completed_at.isoformat(timespec="seconds"), STATUSES["done"], qflag, on_time, month_key(completed_at), task_id),
        )
    log_action(task_id, "done", actor, f"quality={qflag}; on_time={on_time}", row["status"], STATUSES["done"])
    await update.message.reply_text(f"🟢 Задача #{task_id} завершена. В срок: {'да' if on_time else 'нет'}. Правки: {'более 3' if qflag else 'до 3'}.")
    await send_log(context, update.effective_chat.id, f"<b>🟢 Завершена задача #{task_id}</b>\nВ срок: {'да' if on_time else 'нет'}\nПравки: {'более 3' if qflag else 'до 3'}\nЗакрыл: {actor}")


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
    for r in rows:
        lines.append(f"<b>#{r['id']} — {r['title']}</b>\nДедлайн: {fmt_dt(r['deadline'])}\nСтатус: {r['status']}\nИсполнитель: {r['accepted_by'] or '—'}")
    await update.message.reply_text("\n\n".join(lines), parse_mode=ParseMode.HTML)


async def mytasks_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    me = user_name(update)
    with db() as conn:
        rows = conn.execute("SELECT * FROM tasks WHERE status!='завершена' AND accepted_by=? ORDER BY deadline ASC", (me,)).fetchall()
    if not rows:
        await update.message.reply_text("✅ У тебя нет активных задач.")
        return
    lines = ["<b>👤 МОИ ЗАДАЧИ</b>", "━━━━━━━━━━━━━━"]
    for r in rows:
        lines.append(f"<b>#{r['id']} — {r['title']}</b>\nДедлайн: {fmt_dt(r['deadline'])}\nСтатус: {r['status']}")
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
В срок: {'да' if r['on_time'] == 1 else 'нет' if r['on_time'] == 0 else '—'}
Качество: {r['quality_flag'] if r['quality_flag'] is not None else '—'}
Доработок: {r['rework_count']}
""".strip()
    await update.message.reply_text(text, parse_mode=ParseMode.HTML)


def stats_text(month: str, personal_user: Optional[str] = None) -> str:
    rows = completed_rows(month, personal_user)
    total_done = len(rows)
    ontime = sum(1 for r in rows if r["on_time"] == 1)
    late = sum(1 for r in rows if r["on_time"] == 0)
    quality_bad = sum(1 for r in rows if r["quality_flag"] == 1)
    quality_good = total_done - quality_bad
    avg = human_duration(avg_completion(rows))
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
    with db() as conn:
        created = conn.execute("SELECT COUNT(*) c FROM tasks WHERE created_month=?", (month,)).fetchone()["c"]
        active = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status!='завершена'").fetchone()["c"]
        in_work = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status='в работе'").fetchone()["c"]
        rework = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status='на доработке'").fetchone()["c"]
    exec_top = Counter(r["accepted_by"] or "—" for r in rows).most_common(3)
    creator_top = Counter()
    with db() as conn:
        for r in conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall():
            creator_top[r["created_by"]] += 1
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
{top_lines(creator_top.most_common(3))}
""".strip()


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    await update.message.reply_text(stats_text(month), parse_mode=ParseMode.HTML)


async def me_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    await update.message.reply_text(stats_text(month, user_name(update)), parse_mode=ParseMode.HTML)


def report_text(month: str) -> str:
    base = stats_text(month)
    rows = completed_rows(month)
    per = defaultdict(list)
    for r in rows:
        per[r["accepted_by"] or "—"].append(r)
    performers = sorted(per.items(), key=lambda x: len(x[1]), reverse=True)
    details = []
    medals = ["🥇", "🥈", "🥉"]
    for i, (name, rs) in enumerate(performers[:10]):
        details.append(f"{medals[i] if i < 3 else '•'} {name} — {len(rs)} задач\n• В срок: {sum(1 for r in rs if r['on_time']==1)}\n• Просрочек: {sum(1 for r in rs if r['on_time']==0)}\n• С правками более 3: {sum(1 for r in rs if r['quality_flag']==1)}\n• Среднее время: {human_duration(avg_completion(rs))}")
    best = performers[0][0] if performers else "—"
    best_count = len(performers[0][1]) if performers else 0
    return base.replace("<b>📊 СТАТИСТИКА", "<b>📈 ОТЧЁТ") + f"\n\n━━━━━━━━━━━━━━\n\n<b>👨‍🎨 Исполнители</b>\n" + ("\n\n".join(details) or "—") + f"\n\n━━━━━━━━━━━━━━\n\n<b>🏆 Лучший исполнитель месяца</b>\n{best} — {best_count} выполненных задач."


async def report_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    await update.message.reply_text(report_text(month), parse_mode=ParseMode.HTML)


async def top_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    month = context.args[0] if context.args else current_month()
    rows = completed_rows(month)
    exec_top = Counter(r["accepted_by"] or "—" for r in rows).most_common(10)
    with db() as conn:
        creators = Counter(r["created_by"] for r in conn.execute("SELECT created_by FROM tasks WHERE created_month=?", (month,)).fetchall())
    medals = ["🥇", "🥈", "🥉"]
    def lines(items):
        return "\n".join(f"{medals[i] if i < 3 else '•'} {n} — {c}" for i, (n, c) in enumerate(items)) or "—"
    text = f"<b>🏆 РЕЙТИНГ — {month}</b>\n\n━━━━━━━━━━━━━━\n\n<b>👨‍🎨 Исполнители</b>\n{lines(exec_top)}\n\n━━━━━━━━━━━━━━\n\n<b>📨 Постановщики</b>\n{lines(creators.most_common(10))}"
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
        d = parse_date(context.args[0]) if context.args else datetime.now(MSK).date()
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
    start = datetime.now(MSK).date()
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


async def monthly_job(context: ContextTypes.DEFAULT_TYPE):
    if datetime.now(MSK).day != 1:
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
        await context.bot.send_message(chat_id=int(chat_id), message_thread_id=int(topic) if topic else None, text=report_text(month), parse_mode=ParseMode.HTML)
        with db() as conn:
            conn.execute("INSERT INTO monthly_reports(month,sent_at) VALUES(?,?)", (month, now_iso()))
    except Exception as e:
        logger.warning("Monthly report failed: %s", e)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN не найден. Добавьте переменную окружения BOT_TOKEN.")
    init_db()
    app = Application.builder().token(BOT_TOKEN).post_init(setup_commands).build()

    handlers = [
        ("start", start), ("help", help_cmd), ("adminhelp", adminhelp_cmd),
        ("task", task_cmd), ("ok", ok_cmd), ("done", done_cmd), ("rework", rework_cmd), ("reassign", reassign_cmd),
        ("tasks", tasks_cmd), ("mytasks", mytasks_cmd), ("taskinfo", taskinfo_cmd),
        ("me", me_cmd), ("stats", stats_cmd), ("report", report_cmd), ("month_report", report_cmd), ("top", top_cmd),
        ("adddesigner", adddesigner_cmd), ("removedesigner", removedesigner_cmd), ("designers", designers_cmd),
        ("setshiftstart", setshiftstart_cmd), ("online", online_cmd), ("week", week_cmd), ("swap", swap_cmd), ("clearswap", clearswap_cmd),
        ("setlog", setlog_cmd), ("setreports", setreports_cmd),
        ("fixquality", fixquality_cmd), ("fixdeadline", fixdeadline_cmd),
    ]
    for name, fn in handlers:
        app.add_handler(CommandHandler(name, fn))
    app.job_queue.run_repeating(monthly_job, interval=60 * 60 * 6, first=10)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
