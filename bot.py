
import os
import sqlite3
from datetime import datetime
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
DB_NAME = os.getenv("DB_NAME", "design_kpi_bot.db")


def now_dt() -> datetime:
    return datetime.now()


def now_text() -> str:
    return now_dt().strftime("%d.%m.%Y %H:%M")


def month_text(dt: datetime | None = None) -> str:
    return (dt or now_dt()).strftime("%m.%Y")


def connect():
    return sqlite3.connect(DB_NAME)


def init_db() -> None:
    conn = connect()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            deadline TEXT NOT NULL,
            accepted_by TEXT,
            accepted_at TEXT,
            completed_at TEXT,
            status TEXT NOT NULL,
            revisions INTEGER DEFAULT 0,
            on_time INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            month TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            task_id INTEGER,
            action TEXT NOT NULL,
            user TEXT NOT NULL,
            comment TEXT,
            old_status TEXT,
            new_status TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            user TEXT NOT NULL,
            points INTEGER NOT NULL,
            reason TEXT,
            month TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS kpi_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month TEXT NOT NULL,
            total_tasks INTEGER NOT NULL,
            on_time_tasks INTEGER NOT NULL,
            on_time_percent REAL NOT NULL,
            bad_tasks INTEGER NOT NULL,
            bad_percent REAL NOT NULL,
            total_points INTEGER NOT NULL,
            kpi_deadline INTEGER NOT NULL,
            kpi_quality INTEGER NOT NULL,
            total_kpi INTEGER NOT NULL,
            saved_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def get_user_name(update: Update) -> str:
    user = update.effective_user
    if not user:
        return "unknown"
    if user.username:
        return f"@{user.username}"
    return user.full_name


def get_thread_id(update: Update) -> int | None:
    message = update.effective_message
    if not message:
        return None
    return message.message_thread_id


def set_setting(key: str, value: str | int) -> None:
    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, (key, str(value)))
    conn.commit()
    conn.close()


def get_setting(key: str) -> str | None:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


def add_task_log(
    task_id: int | str | None,
    action: str,
    user: str,
    comment: str = "",
    old_status: str = "",
    new_status: str = "",
) -> None:
    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO task_log
        (created_at, task_id, action, user, comment, old_status, new_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (now_text(), task_id, action, user, comment, old_status, new_status))
    conn.commit()
    conn.close()


async def send_to_saved_thread(
    context: ContextTypes.DEFAULT_TYPE,
    chat_id: int,
    setting_key: str,
    text: str,
) -> None:
    thread_id = get_setting(setting_key)
    if not thread_id:
        return

    try:
        await context.bot.send_message(
            chat_id=chat_id,
            message_thread_id=int(thread_id),
            text=text,
        )
    except Exception as exc:
        print(f"Не удалось отправить сообщение в тему {setting_key}: {exc}")


def parse_deadline(deadline: str) -> datetime:
    return datetime.strptime(deadline.strip(), "%d.%m.%Y %H:%M")


def calc_points(revisions: int, on_time: int) -> int:
    if revisions <= 2:
        points = 5
    elif revisions <= 5:
        points = 3
    else:
        points = 1

    if not on_time:
        points -= 2

    return max(points, 0)


def get_kpi_data(month: str) -> dict | None:
    conn = connect()
    cur = conn.cursor()

    cur.execute("""
        SELECT COUNT(*)
        FROM tasks
        WHERE status = 'завершена' AND month = ?
    """, (month,))
    total_tasks = cur.fetchone()[0]

    if total_tasks == 0:
        conn.close()
        return None

    cur.execute("""
        SELECT COUNT(*)
        FROM tasks
        WHERE status = 'завершена' AND month = ? AND on_time = 1
    """, (month,))
    on_time_tasks = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*)
        FROM tasks
        WHERE status = 'завершена' AND month = ? AND revisions >= 6
    """, (month,))
    bad_tasks = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(points), 0)
        FROM scores
        WHERE month = ?
    """, (month,))
    total_points = cur.fetchone()[0]

    conn.close()

    on_time_percent = round(on_time_tasks / total_tasks * 100, 2)
    bad_percent = round(bad_tasks / total_tasks * 100, 2)

    if on_time_percent >= 99:
        kpi_deadline = 10000
    elif on_time_percent >= 90:
        kpi_deadline = 7000
    else:
        kpi_deadline = 0

    if bad_percent <= 3:
        kpi_quality = 5000
    elif bad_percent <= 10:
        kpi_quality = 2500
    else:
        kpi_quality = 0

    return {
        "month": month,
        "total_tasks": total_tasks,
        "on_time_tasks": on_time_tasks,
        "on_time_percent": on_time_percent,
        "bad_tasks": bad_tasks,
        "bad_percent": bad_percent,
        "total_points": total_points,
        "kpi_deadline": kpi_deadline,
        "kpi_quality": kpi_quality,
        "total_kpi": kpi_deadline + kpi_quality,
    }


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await help_cmd(update, context)


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = """
📌 Команды KPI-бота

Настройка:
/setlog — назначить текущую тему логом задач
/setreports — назначить текущую тему для KPI-отчётов

Задачи:
/task Название | Дедлайн | Описание
Создать задачу.

Пример:
/task Баннер VK | 25.07.2026 18:00 | Сделать баннер 1080x1080

/ok ID
Принять задачу в работу.

Пример:
/ok 1

/done ID Правки
Завершить задачу.

Пример:
/done 1 2

/rework ID Причина
Отправить задачу на доработку.

Пример:
/rework 1 Неверный размер баннера

/tasks
Показать активные задачи.

/taskinfo ID
Показать карточку задачи.

Баллы:
/score @user +5 Причина
Начислить или списать баллы вручную.

Пример:
/score @george +5 Срочная задача

/myscore
Мои баллы за текущий месяц.

KPI:
/stats
Статистика за текущий месяц.

/stats 07.2026
Статистика за конкретный месяц.

/kpi
KPI за текущий месяц.

/kpi 07.2026
KPI за конкретный месяц.

/savekpi
Сохранить KPI текущего месяца в архив.

/savekpi 07.2026
Сохранить KPI выбранного месяца в архив.

/kpi_history
Показать историю сохранённых KPI.

Система баллов:
0–2 правки = +5
3–5 правок = +3
6+ правок = +1
Просрочка = -2
"""
    await update.effective_message.reply_text(text)


async def setlog(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    thread_id = get_thread_id(update)
    if thread_id is None:
        await update.effective_message.reply_text("❌ Команду /setlog нужно писать в теме Telegram-группы.")
        return

    set_setting("log_thread_id", thread_id)
    await update.effective_message.reply_text("✅ Эта тема назначена логом задач.")


async def setreports(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    thread_id = get_thread_id(update)
    if thread_id is None:
        await update.effective_message.reply_text("❌ Команду /setreports нужно писать в теме Telegram-группы.")
        return

    set_setting("reports_thread_id", thread_id)
    await update.effective_message.reply_text("✅ Эта тема назначена темой KPI-отчётов.")


async def task(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message_text = update.effective_message.text or ""
    raw = message_text.replace("/task", "", 1).strip()
    parts = [part.strip() for part in raw.split("|")]

    if len(parts) < 3:
        await update.effective_message.reply_text(
            "❌ Неверный формат.\n\n"
            "Используй:\n/task Название | Дедлайн | Описание\n\n"
            "Пример:\n/task Баннер VK | 25.07.2026 18:00 | Сделать баннер"
        )
        return

    title = parts[0]
    deadline = parts[1]
    description = "|".join(parts[2:]).strip()

    try:
        parse_deadline(deadline)
    except ValueError:
        await update.effective_message.reply_text(
            "❌ Дедлайн должен быть в формате:\n25.07.2026 18:00"
        )
        return

    user = get_user_name(update)
    created_at = now_text()
    month = month_text()

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO tasks
        (title, description, created_by, created_at, deadline, status, month)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (title, description, user, created_at, deadline, "ожидает принятия", month))
    task_id = cur.lastrowid
    conn.commit()
    conn.close()

    add_task_log(task_id, "создана", user, title, "", "ожидает принятия")

    await update.effective_message.reply_text(
        f"✅ Задача #{task_id} создана.\nСтатус: ожидает принятия."
    )

    log_text = (
        f"🆕 Задача #{task_id} поступила\n\n"
        f"Название: {title}\n"
        f"Автор: {user}\n"
        f"Создана: {created_at}\n"
        f"Дедлайн: {deadline}\n"
        f"Статус: ожидает принятия\n\n"
        f"Описание:\n{description}"
    )

    await send_to_saved_thread(context, update.effective_chat.id, "log_thread_id", log_text)


async def ok(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.effective_message.reply_text("❌ Формат:\n/ok ID\n\nПример:\n/ok 1")
        return

    task_id = context.args[0]
    user = get_user_name(update)
    accepted_at = now_text()

    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        await update.effective_message.reply_text("❌ Задача не найдена.")
        return

    old_status = row[0]

    if old_status == "завершена":
        conn.close()
        await update.effective_message.reply_text("❌ Нельзя принять завершённую задачу.")
        return

    cur.execute("""
        UPDATE tasks
        SET status = 'в работе',
            accepted_by = ?,
            accepted_at = ?
        WHERE id = ?
    """, (user, accepted_at, task_id))
    conn.commit()
    conn.close()

    add_task_log(task_id, "принята", user, "", old_status, "в работе")

    await update.effective_message.reply_text(
        f"🔵 Задача #{task_id} принята в работу.\nИсполнитель: {user}"
    )

    await send_to_saved_thread(
        context,
        update.effective_chat.id,
        "log_thread_id",
        f"🔵 Задача #{task_id} принята\n\nИсполнитель: {user}\nДата: {accepted_at}",
    )


async def done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if len(context.args) < 2:
        await update.effective_message.reply_text(
            "❌ Формат:\n/done ID количество_правок\n\nПример:\n/done 1 2"
        )
        return

    task_id = context.args[0]

    try:
        revisions = int(context.args[1])
    except ValueError:
        await update.effective_message.reply_text("❌ Количество правок должно быть числом.")
        return

    if revisions < 0:
        await update.effective_message.reply_text("❌ Количество правок не может быть меньше 0.")
        return

    user = get_user_name(update)
    completed_at = now_text()

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT deadline, status, accepted_by
        FROM tasks
        WHERE id = ?
    """, (task_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        await update.effective_message.reply_text("❌ Задача не найдена.")
        return

    deadline, old_status, accepted_by = row

    if old_status == "завершена":
        conn.close()
        await update.effective_message.reply_text("❌ Эта задача уже завершена.")
        return

    try:
        on_time = 1 if now_dt() <= parse_deadline(deadline) else 0
    except ValueError:
        on_time = 0

    points = calc_points(revisions, on_time)
    score_user = accepted_by or user
    month = month_text()

    cur.execute("""
        UPDATE tasks
        SET status = 'завершена',
            completed_at = ?,
            revisions = ?,
            on_time = ?,
            points = ?
        WHERE id = ?
    """, (completed_at, revisions, on_time, points, task_id))

    cur.execute("""
        INSERT INTO scores
        (created_at, user, points, reason, month)
        VALUES (?, ?, ?, ?, ?)
    """, (
        completed_at,
        score_user,
        points,
        f"Задача #{task_id}, правок: {revisions}",
        month,
    ))

    conn.commit()
    conn.close()

    add_task_log(
        task_id,
        "завершена",
        user,
        f"{revisions} правок, +{points} баллов",
        old_status,
        "завершена",
    )

    await update.effective_message.reply_text(
        f"🟢 Задача #{task_id} завершена.\n"
        f"Правок: {revisions}\n"
        f"В срок: {'да' if on_time else 'нет'}\n"
        f"Баллы: +{points}"
    )

    await send_to_saved_thread(
        context,
        update.effective_chat.id,
        "log_thread_id",
        f"🟢 Задача #{task_id} завершена\n\n"
        f"Исполнитель: {score_user}\n"
        f"Дата: {completed_at}\n"
        f"Правок: {revisions}\n"
        f"В срок: {'да' if on_time else 'нет'}\n"
        f"Начислено баллов: +{points}",
    )


async def rework(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.effective_message.reply_text(
            "❌ Формат:\n/rework ID Причина\n\nПример:\n/rework 1 Неверный размер"
        )
        return

    task_id = context.args[0]
    reason = " ".join(context.args[1:]).strip() or "Причина не указана"
    user = get_user_name(update)

    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        await update.effective_message.reply_text("❌ Задача не найдена.")
        return

    old_status = row[0]

    if old_status == "завершена":
        conn.close()
        await update.effective_message.reply_text("❌ Нельзя отправить завершённую задачу на доработку.")
        return

    cur.execute("""
        UPDATE tasks
        SET status = 'на доработке'
        WHERE id = ?
    """, (task_id,))
    conn.commit()
    conn.close()

    add_task_log(task_id, "доработка", user, reason, old_status, "на доработке")

    await update.effective_message.reply_text(f"🟠 Задача #{task_id} отправлена на доработку.")

    await send_to_saved_thread(
        context,
        update.effective_chat.id,
        "log_thread_id",
        f"🟠 Задача #{task_id} на доработке\n\n"
        f"Кто отправил: {user}\n"
        f"Причина:\n{reason}",
    )


async def tasks(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, deadline, status, accepted_by
        FROM tasks
        WHERE status != 'завершена'
        ORDER BY id DESC
        LIMIT 30
    """)
    rows = cur.fetchall()
    conn.close()

    if not rows:
        await update.effective_message.reply_text("📭 Активных задач нет.")
        return

    text = "📋 Активные задачи:\n\n"
    for task_id, title, deadline, status, accepted_by in rows:
        text += (
            f"#{task_id} — {title}\n"
            f"Дедлайн: {deadline}\n"
            f"Статус: {status}\n"
            f"Исполнитель: {accepted_by or 'не назначен'}\n\n"
        )

    await update.effective_message.reply_text(text)


async def taskinfo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.effective_message.reply_text("❌ Формат:\n/taskinfo ID")
        return

    task_id = context.args[0]

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT title, description, created_by, created_at, deadline,
               accepted_by, accepted_at, completed_at, status,
               revisions, on_time, points
        FROM tasks
        WHERE id = ?
    """, (task_id,))
    row = cur.fetchone()
    conn.close()

    if not row:
        await update.effective_message.reply_text("❌ Задача не найдена.")
        return

    (
        title,
        description,
        created_by,
        created_at,
        deadline,
        accepted_by,
        accepted_at,
        completed_at,
        status,
        revisions,
        on_time,
        points,
    ) = row

    text = (
        f"📌 Задача #{task_id}\n\n"
        f"Название: {title}\n"
        f"Статус: {status}\n\n"
        f"Автор: {created_by}\n"
        f"Создана: {created_at}\n"
        f"Исполнитель: {accepted_by or 'не назначен'}\n"
        f"Принята: {accepted_at or '—'}\n\n"
        f"Дедлайн: {deadline}\n"
        f"Завершена: {completed_at or '—'}\n"
        f"Правки: {revisions}\n"
        f"В срок: {'да' if on_time else 'нет'}\n"
        f"Баллы: {points}\n\n"
        f"Описание:\n{description}"
    )

    await update.effective_message.reply_text(text)


async def score(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if len(context.args) < 3:
        await update.effective_message.reply_text(
            "❌ Формат:\n/score @user +5 Причина\n\nПример:\n/score @george +5 Срочная задача"
        )
        return

    target_user = context.args[0]

    try:
        points = int(context.args[1])
    except ValueError:
        await update.effective_message.reply_text("❌ Баллы должны быть числом: +5 или -2.")
        return

    reason = " ".join(context.args[2:]).strip()
    created_at = now_text()
    month = month_text()

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scores
        (created_at, user, points, reason, month)
        VALUES (?, ?, ?, ?, ?)
    """, (created_at, target_user, points, reason, month))
    conn.commit()
    conn.close()

    await update.effective_message.reply_text(
        f"✅ Баллы обновлены.\n"
        f"{target_user}: {points:+}\n"
        f"Причина: {reason}"
    )


async def myscore(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = get_user_name(update)
    month = month_text()

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT COALESCE(SUM(points), 0)
        FROM scores
        WHERE user = ? AND month = ?
    """, (user, month))
    total = cur.fetchone()[0]
    conn.close()

    await update.effective_message.reply_text(f"🏅 {user}, твои баллы за {month}: {total}")


async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    month = context.args[0] if context.args else month_text()
    data = get_kpi_data(month)

    if not data:
        await update.effective_message.reply_text(f"📭 За {month} пока нет завершённых задач.")
        return

    text = (
        f"📊 Статистика за {month}\n\n"
        f"Завершено задач: {data['total_tasks']}\n"
        f"В срок: {data['on_time_tasks']}\n"
        f"Процент в срок: {data['on_time_percent']}%\n\n"
        f"Проблемных задач, 6+ правок: {data['bad_tasks']}\n"
        f"Процент проблемных: {data['bad_percent']}%\n\n"
        f"Баллы всего: {data['total_points']}"
    )

    await update.effective_message.reply_text(text)


async def kpi(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    month = context.args[0] if context.args else month_text()
    data = get_kpi_data(month)

    if not data:
        await update.effective_message.reply_text(f"📭 За {month} пока нет данных для KPI.")
        return

    text = (
        f"💰 KPI за {month}\n\n"
        f"KPI №1 — выполнение задач в срок:\n"
        f"{data['on_time_percent']}%\n"
        f"Сумма: {data['kpi_deadline']} ₽\n\n"
        f"KPI №2 — качество:\n"
        f"Проблемных задач: {data['bad_percent']}%\n"
        f"Сумма: {data['kpi_quality']} ₽\n\n"
        f"Баллы: {data['total_points']}\n\n"
        f"Итого KPI: {data['total_kpi']} ₽"
    )

    await update.effective_message.reply_text(text)
    await send_to_saved_thread(context, update.effective_chat.id, "reports_thread_id", text)


async def savekpi(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    month = context.args[0] if context.args else month_text()
    data = get_kpi_data(month)

    if not data:
        await update.effective_message.reply_text(f"📭 За {month} нечего сохранять.")
        return

    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO kpi_archive
        (month, total_tasks, on_time_tasks, on_time_percent, bad_tasks,
         bad_percent, total_points, kpi_deadline, kpi_quality, total_kpi, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["month"],
        data["total_tasks"],
        data["on_time_tasks"],
        data["on_time_percent"],
        data["bad_tasks"],
        data["bad_percent"],
        data["total_points"],
        data["kpi_deadline"],
        data["kpi_quality"],
        data["total_kpi"],
        now_text(),
    ))
    conn.commit()
    conn.close()

    await update.effective_message.reply_text(f"✅ KPI за {month} сохранён в архив.")


async def kpi_history(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        SELECT month, total_tasks, on_time_percent, bad_percent,
               total_points, total_kpi, saved_at
        FROM kpi_archive
        ORDER BY id DESC
        LIMIT 12
    """)
    rows = cur.fetchall()
    conn.close()

    if not rows:
        await update.effective_message.reply_text("📭 Архив KPI пока пуст.")
        return

    text = "📚 История KPI:\n\n"
    for row in rows:
        month, total_tasks, on_time_percent, bad_percent, total_points, total_kpi, saved_at = row
        text += (
            f"{month}\n"
            f"Задач: {total_tasks}\n"
            f"В срок: {on_time_percent}%\n"
            f"Проблемных: {bad_percent}%\n"
            f"Баллы: {total_points}\n"
            f"KPI: {total_kpi} ₽\n"
            f"Сохранено: {saved_at}\n\n"
        )

    await update.effective_message.reply_text(text)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError(
            "Не найден BOT_TOKEN. Добавь переменную окружения BOT_TOKEN в Railway или вставь токен в код."
        )

    init_db()

    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))

    app.add_handler(CommandHandler("setlog", setlog))
    app.add_handler(CommandHandler("setreports", setreports))

    app.add_handler(CommandHandler("task", task))
    app.add_handler(CommandHandler("ok", ok))
    app.add_handler(CommandHandler("done", done))
    app.add_handler(CommandHandler("rework", rework))
    app.add_handler(CommandHandler("tasks", tasks))
    app.add_handler(CommandHandler("taskinfo", taskinfo))

    app.add_handler(CommandHandler("score", score))
    app.add_handler(CommandHandler("myscore", myscore))

    app.add_handler(CommandHandler("stats", stats))
    app.add_handler(CommandHandler("kpi", kpi))
    app.add_handler(CommandHandler("savekpi", savekpi))
    app.add_handler(CommandHandler("kpi_history", kpi_history))

    print("Бот запущен.")
    app.run_polling()


if __name__ == "__main__":
    main()
