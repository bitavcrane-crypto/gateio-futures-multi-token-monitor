# Gate.io Futures Multi-Token Monitor

Україномовний мобільний віджет для аналізу USDT-M perpetual futures на Gate.io. Працює лише з публічними даними, не торгує та не потребує API-ключів.

## Функції
- Додавання та видалення до 15 контрактів.
- Пошук серед активних USDT perpetual контрактів Gate.io.
- Збереження списку в LocalStorage поточного браузера.
- Автооновлення кожні 60 секунд та ручне оновлення.
- EMA20/EMA50, RSI14, ATR14, рух за 72 години.
- Funding, Open Interest, L/S account ratio, ліквідації, Bid/Ask depth.
- Bearish score, статуси та пояснення попереджень.
- Розрахункові рівні на основі swing high/low та ATR.

## Публікація GitHub Pages
1. Відкрий Settings → Pages.
2. У Build and deployment обери Deploy from a branch.
3. Branch: main; Folder: / (root).
4. Натисни Save.

URL після публікації:
https://bitavcrane-crypto.github.io/gateio-futures-multi-token-monitor/

## Джерела API
Gate.io API v4:
- /futures/usdt/contracts
- /futures/usdt/tickers
- /futures/usdt/candlesticks
- /futures/usdt/contract_stats
- /futures/usdt/order_book
- /futures/usdt/funding_rate

Документація: https://www.gate.com/docs/developers/apiv4/en/futures/

## Обмеження
- Список монет зберігається окремо в кожному браузері/пристрої; синхронізації між пристроями немає.
- Якщо браузер або мережа блокує запити до Gate API (наприклад, через CORS), інтерфейс покаже помилку.
- Зміна OI порівнює останню точку з точкою приблизно 24 години тому, якщо така доступна.
- L/S account ratio — співвідношення акаунтів, а не обсягів позицій.
- Глибина стакана — моментальний знімок, не гарантує підтримку/опір.
- Незакрита 1h свічка виключається з індикаторів.
- Поля ліквідацій у contract_stats потрібно трактувати відповідно до одиниць і семантики, підтверджених Gate API; відсутні значення не є нулями.
- Статуси — евристичні аналітичні підказки, не торгові сигнали. Відсутні дані показуються як N/A.

## Локальний запуск
Використай HTTP-сервер, а не file://:
python -m http.server 8000

Потім відкрий http://localhost:8000
