import os
import json
import requests
from http.server import BaseHTTPRequestHandler

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
API_URL = f'https://api.telegram.org/bot{BOT_TOKEN}'

# Домен вашего сайта — оттуда бот берёт картинки инструкции.
# Файлы должны лежать в папке media/ рядом с index.html, например:
# media/help1.jpg, media/help2.jpg, media/help3.jpg, media/help4.jpg
SITE_URL = 'https://wishlistsite.vercel.app'

HELP_STEPS = [
    f'{SITE_URL}/media/slide1.png',
    f'{SITE_URL}/media/slide2.png',
    f'{SITE_URL}/media/slide3.png',
    f'{SITE_URL}/media/slide4.png',
]


def build_keyboard(index):
    buttons = []
    if index > 0:
        buttons.append({'text': '< Back', 'callback_data': f'help:{index - 1}'})
    if index < len(HELP_STEPS) - 1:
        buttons.append({'text': 'Hext >', 'callback_data': f'help:{index + 1}'})
    return {'inline_keyboard': [buttons]}


def send_photo(chat_id, index):
    requests.post(f'{API_URL}/sendPhoto', json={
        'chat_id': chat_id,
        'photo': HELP_STEPS[index],
        'reply_markup': build_keyboard(index)
    })


def edit_photo(chat_id, message_id, index):
    requests.post(f'{API_URL}/editMessageMedia', json={
        'chat_id': chat_id,
        'message_id': message_id,
        'media': {
            'type': 'photo',
            'media': HELP_STEPS[index]
        },
        'reply_markup': build_keyboard(index)
    })


def answer_callback(callback_query_id):
    requests.post(f'{API_URL}/answerCallbackQuery', json={
        'callback_query_id': callback_query_id
    })


def handle_update(update):
    # Обработка команды /help
    message = update.get('message')
    if message:
        text = message.get('text', '')
        if text.startswith('/help'):
            chat_id = message['chat']['id']
            send_photo(chat_id, 0)
        return

    # Обработка нажатий на кнопки Back / Further
    callback = update.get('callback_query')
    if callback:
        data = callback.get('data', '')
        if data.startswith('help:'):
            index = int(data.split(':')[1])
            chat_id = callback['message']['chat']['id']
            message_id = callback['message']['message_id']
            edit_photo(chat_id, message_id, index)
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