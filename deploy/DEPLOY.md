# Развёртывание на VPS

Репозиторий: https://github.com/resccrew/alexwork.git

Бот работает через long-polling (сам стучится в Telegram), поэтому **не нужно**
открывать никакие порты и настраивать домен/HTTPS на сервере. Подходит
любой недорогой VPS с Ubuntu/Debian.

Цель этой инструкции — чтобы даже при полной потере старого сервера новый
можно было поднять и вернуть все данные примерно за 10 минут (см. раздел
«Сервер погиб» внизу).

## 1. Первоначальная установка

Выполняется один раз на новом сервере (по SSH, от имени root или через sudo).

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip git
sudo useradd -r -m -d /opt/dyzury-bot -s /usr/sbin/nologin dyzurybot
sudo -u dyzurybot git clone https://github.com/resccrew/alexwork.git /opt/dyzury-bot
cd /opt/dyzury-bot
sudo -u dyzurybot python3 -m venv .venv
sudo -u dyzurybot .venv/bin/pip install -r requirements.txt
```

Если репозиторий приватный, `git clone` спросит логин/пароль — в поле пароля
нужно вставить не пароль от GitHub, а **Personal Access Token**
(GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
tokens → доступ только к этому репозиторию, права Contents: Read-only).

## 2. Настройка .env

Файл `.env` **никогда не хранится в git** — создаём вручную на сервере:

```bash
sudo -u dyzurybot nano /opt/dyzury-bot/.env
```

Содержимое:

```
BOT_TOKEN=<токен из BotFather>
ADMIN_CHAT_ID=<chat_id врача>
```

Можно вписать несколько человек через запятую (все видят одни и те же данные):

```
ADMIN_CHAT_ID=542407863,987654321
```

Как узнать `chat_id` человека: он присылает боту `/start` — если его ещё нет в
списке, бот сам ответит только ему «Это личный бот», а в лог (`data/bot.log`
или `journalctl -u dyzury-bot`) попадёт строка вида `Unrecognized /start from
chat_id=...` (для первого запуска, когда список вообще пуст, бот прямо в чате
покажет chat_id). Дописать его в `ADMIN_CHAT_ID` через запятую и перезапустить
(шаг 4).

## 3. Проверочный запуск вручную

Прежде чем ставить автозапуск, убедимся, что всё работает:

```bash
sudo -u dyzurybot /opt/dyzury-bot/.venv/bin/python /opt/dyzury-bot/bot.py
```

В логе должна появиться строка `Run polling for bot @...`. Проверьте бота в
Telegram (/start, кнопки). Остановить: `Ctrl+C`.

## 4. Автозапуск через systemd

```bash
sudo cp /opt/dyzury-bot/deploy/dyzury-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dyzury-bot
sudo systemctl status dyzury-bot
```

Полезные команды:

```bash
sudo systemctl restart dyzury-bot     # перезапуск (например, после git pull)
sudo journalctl -u dyzury-bot -f      # смотреть логи в реальном времени
```

Сервис настроен на автоматический перезапуск при падении (`Restart=always`) и
запуск при загрузке сервера.

## 5. Обновление кода на сервере

```bash
cd /opt/dyzury-bot
sudo -u dyzurybot git pull
sudo -u dyzurybot .venv/bin/pip install -r requirements.txt
sudo systemctl restart dyzury-bot
```

## 6. Сервер погиб — план восстановления (~10 минут)

Это ровно та ситуация, из-за которой всё затевалось: старые данные пропали
вместе с сервером без бэкапов. Теперь бэкапы (SQLite-база + Excel) сами
прилетают врачу в Telegram после каждой закрытой смены и раз в сутки в 23:00
— они переживают любой сгоревший сервер.

1. Поднять новый VPS, выполнить разделы 1–4 этой инструкции заново
   (`ADMIN_CHAT_ID` уже известен — можно сразу вписать в `.env`, не ждать
   /start).
2. В Telegram найти последнее сообщение бота с файлом `work_*.db`
   (бэкап базы).
3. Ответить (reply) на это сообщение командой `/restore`.
4. Бот покажет размер файла и попросит подтверждение — нажать
   «⚠️ Да, заменить базу».
5. Готово: вся история смен и дежурств восстановлена. Проверить командой
   «📊 Мои часы» или «📄 Таблица».

Восстановление никогда не удаляет данные молча: перед заменой бот сам
сохраняет прежнюю базу рядом как `work.db.bak-<дата>`.

## 7. Если токен бота когда-либо "засветился"

BotFather → `/mybots` → выбрать бота → **API Token** → **Revoke current
token** → скопировать новый → вписать в `.env` на сервере → `sudo systemctl
restart dyzury-bot`. Юзернейм бота (и вся история чата с врачом) при этом не
меняется.
