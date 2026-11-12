import os
import json
import requests
from http.server import BaseHTTPRequestHandler

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
API_URL = f'https://api.telegram.org/bot{BOT_TOKEN}'

HELP_TEXT = {
    'en': """<b>Help</b>

Welcome, you have opened the application guide.
Let's start with the basics:
• Creating an entry: To create an entry, tap the green plus icon in the bottom right corner. A window with a form will open, where you can fill in all the necessary details. Please note: price changes will only be visible once you open the entry.
• Viewing an entry: Tap once on a created entry to open the link you added.
• Editing an entry: Editing is done by switching modes. Hold down the plus button used to open the creation window to switch to edit mode; hold it down again to exit this mode. To edit entries, tap once on the desired entry to open the editing window.
• Editing an entry (groups): Groups are used to organize items in one place. To create a group, tap the Group (optional) field when creating or editing an entry. If you have already created a group and want to add an entry to it, tap this field and select the desired one from the dropdown list.

Other features of the mini-app:
• Bottom panel: To the left of the plus button, you can see two values: gray and green. Green represents the total sum of all selected entries. Gray shows the total number of entries currently visible on your screen (depending on active filters).
• Filters: You can choose what to display right now by tapping the icon in the top right corner, which opens three filter options:
Block type: All, groups, or single items.
Price range: Enter the minimum price in the first field and the maximum in the second.
Classic sorting: By price or alphabetically (determining what appears first and last).
• Dragging blocks: You can also rearrange all blocks however you like. Simply hold down the desired entry and drag it to where you want it to appear in the list.""",

    'ua': """<b>Довідка</b>

Вітаю, ви відкрили гайд із користування застосунком.
Почнімо з бази:
• Створення запису: Щоб створити запис, натисніть на зелений плюсик у правому нижньому куті — відкриється вікно з формою, де ви зможете заповнити всі потрібні дані. Але майте на увазі: зміни у ціні ви зможете помітити лише тоді, коли відкриєте свій запис.
• Перегляд запису: Натисніть 1 раз на створений запис, аби відкрити посилання, яке ви додали.
• Редагування запису: Редагування відбувається за допомогою перемикання режимів. Затисніть плюсик, яким відкривали вікно створення запису, й таким чином перейдіть у режим редагування. Аби вийти з нього, знову затисніть той самий плюсик. Щоб редагувати записи, натисніть 1 раз на потрібний — вам відкриється вікно редагування.
• Редагування запису (групи): Групи потрібні, щоб зібрати товари в одному місці. Щоб створити групу, під час створення чи редагування запису натисніть на поле Group (optional). А якщо ви вже створили групу й бажаєте додати до неї запис, затисніть це поле й виберіть потрібну зі спадного списку.

Інші можливості міні-застосунку:
• Нижня панель: Лівіше від плюсика ви можете бачити два значення — сіре й зелене. Зелене — це загальна сума всіх вибраних записів. Сіре — це загальна кількість записів, які ви бачите на екрані (залежно від установлених фільтрів).
• Фільтри: Ви можете вибрати, що саме відображати прямо зараз. Натисніть на віконце у правому верхньому куті, і вам відкриється вибір трьох фільтрів:
Тип блоків: Усі, групи або поодинокі.
Цінова категорія: у першому полі вказуєте від якої ціни, у другому — до якої.
Класичне сортування: за ціною або за літерами (що буде стояти першим, а що — останнім).
• Перетягування блоків: Ви також можете розставити всі блоки так, як вам зручно. Для цього всього лише потрібно затиснути потрібний запис і перетягнути його туди, де ви хочете його бачити у списку.""",
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