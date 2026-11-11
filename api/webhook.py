import os
import json
import requests
from http.server import BaseHTTPRequestHandler

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
API_URL = f'https://api.telegram.org/bot{BOT_TOKEN}'

# ============================================================
# ТЕКСТЫ СПРАВКИ — ВПИШИТЕ СВОИ СЮДА
# Можно использовать HTML-разметку Telegram: <b>жирный</b>, <i>курсив</i>,
# <code>моно</code>, <a href="https://...">ссылка</a>.
# Символы < > & в обычном тексте пишите как &lt; &gt; &amp; —
# но если забудете, бот всё равно отправит текст, просто без разметки.
# Перенос строки — обычный \n внутри тройных кавычек.
# ============================================================
HELP_TEXT = {
    'en': """<b>Help</b>

English help text goes here.""",

    'ua': """<b>Довідка</b>

Тут буде текст довідки українською.""",
}

# Что бот пишет, пока язык ещё не выбран
CHOOSE_LANGUAGE_TEXT = 'Choose a language / Оберіть мову'

LANGUAGES = [
    ('en', 'EN'),
    ('ua', 'UA'),
]


def build_keyboard(active=None):
    """Кнопки EN | UA. У выбранного языка стоит галочка."""
    buttons = []
    for code, label in LANGUAGES:
        text = f'✓ {label}' if code == active else label
        buttons.append({'text': text, 'callback_data': f'help:{code}'})
    return {'inline_keyboard': [buttons]}


def send_language_choice(chat_id):
    requests.post(f'{API_URL}/sendMessage', json={
        'chat_id': chat_id,
        'text': CHOOSE_LANGUAGE_TEXT,
        'reply_markup': build_keyboard(),
    })


def edit_to_help_text(chat_id, message_id, lang):
    """Заменяет сообщение с выбором языка на текст справки (кнопки остаются — язык можно переключить)."""
    payload = {
        'chat_id': chat_id,
        'message_id': message_id,
        'text': HELP_TEXT[lang],
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
        'reply_markup': build_keyboard(lang),
    }
    resp = requests.post(f'{API_URL}/editMessageText', json=payload)

    # Если в тексте сломана HTML-разметка — отправляем тот же текст без разметки
    if not resp.ok and 'parse entities' in resp.text:
        payload.pop('parse_mode')
        resp = requests.post(f'{API_URL}/editMessageText', json=payload)

    # «message is not modified» (нажали уже выбранный язык) — это нормально
    if not resp.ok and 'not modified' not in resp.text:
        print('editMessageText failed:', resp.text)


def answer_callback(callback_query_id):
    requests.post(f'{API_URL}/answerCallbackQuery', json={
        'callback_query_id': callback_query_id
    })


def is_help_command(text):
    # '/help' и '/help@имя_бота' (так команда приходит в группах)
    first_word = text.strip().split(' ')[0] if text else ''
    return first_word.split('@')[0] == '/help'


def handle_update(update):
    message = update.get('message')
    if message:
        if is_help_command(message.get('text', '')):
            send_language_choice(message['chat']['id'])
        return

    callback = update.get('callback_query')
    if callback:
        data = callback.get('data', '')
        if data.startswith('help:'):
            lang = data.split(':', 1)[1]
            if lang in HELP_TEXT:
                edit_to_help_text(
                    callback['message']['chat']['id'],
                    callback['message']['message_id'],
                    lang,
                )
        answer_callback(callback['id'])


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            update = json.loads(body)
            handle_update(update)
        except Exception as e:
            print('Error handling update:', e)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok": true}')