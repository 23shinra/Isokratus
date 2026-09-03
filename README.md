# Platonus Lite

Минимальный клиент к Platonus: **расписание**, **журнал оценок**, **QR посещаемости**.

Вход в учётку → три модуля. Без ленты, музыки и остального шума официального приложения.

## Стек

- Next.js (App Router) + Tailwind v4 + Motion
- UI по [Taste Skill / minimalist-ui](https://www.tasteskill.dev/)
- Прокси к недокументированному REST Platonus (`token` header)

## Запуск

```bash
cp .env.example .env.local
# опционально: NEXT_PUBLIC_PLATONUS_URL=https://platonus.your-uni.kz

npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000), укажи URL своего Platonus, логин и пароль.

## Как это работает

1. `POST /rest/api/login` — получаем `auth_token`
2. Дальше запросы идут с заголовком `token`
3. Клиент бьёт в локальные `/api/platonus/*`, сервер проксирует на вуз (обход CORS)
4. Для расписания / журнала / QR перебираются известные пути разных версий Platonus

Пароль **не сохраняется**. В `localStorage` только `baseUrl`, `token`, ФИО и язык.

## Если что-то не подтянулось

У Platonus куча версий, пути плавают. В ответе API при ошибке есть `tried` — список опробованных эндпоинтов.

Пришли URL своего вуза и (если можешь) Network-запрос из веб/приложения для schedule или QR — добавим точный путь.

## Модули

| Раздел | Назначение |
| --- | --- |
| `/schedule` | Недельное расписание |
| `/grades` | Журнал + детали по предмету |
| `/qr` | Скан камерой или ручной ввод кода |
