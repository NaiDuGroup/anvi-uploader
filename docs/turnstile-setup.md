# Защита от ботов: Cloudflare Turnstile

Turnstile — бесплатная «невидимая капча» от Cloudflare. Обычный покупатель ничего не видит; только если Cloudflare что-то заподозрит, внизу экрана появится маленькое окошко «Я не робот» (одна галочка).

Пока ключи не заданы — **защита выключена**, сайт работает как раньше.

## Что защищено

| Где | Что проверяется | Когда включено |
|---|---|---|
| anvi.md → оформление заказа (`/api/shop/checkout`) | каждая отправка заказа | заданы оба ключа |
| anvi.md → «Intră în cont» (`/api/shop/account/login`) | каждый запрос письма со ссылкой/кодом | заданы оба ключа |
| print.anvi.md → заказ без входа (`/`, `/mug`, `/pen`, `/notebook` → `/api/upload-url`, `/api/orders`) | одна проверка на визит (cookie на 2 часа) | **только** если ещё `TURNSTILE_PROTECT_UPLOADER=1` |

Не проверяются никогда: сотрудники (вход в админку), тестеры магазина (ссылка-тестер), клиенты, вошедшие в кабинет print.anvi.md.

Правила при сбоях:
- Cloudflare недоступен с сервера (таймаут 4 с, ошибка 5xx) — заказ **пропускается** (запись в логах `[turnstile]`).
- Cloudflare ответил «токен неверный» — запрос отклоняется, покупатель видит «Nu am putut confirma că nu ești robot… Încearcă din nou».
- Загрузчик print.anvi.md (клиенты по QR в студии): если у клиента не загрузился скрипт Cloudflare, заказ всё равно проходит. По умолчанию загрузчик вообще не защищён — включайте флаг, только если пойдёт спам.

## 1. Создать виджет в Cloudflare

Аккаунт Cloudflare уже есть (там R2).

1. Зайти на https://dash.cloudflare.com → в меню слева **Turnstile** (если нет в меню — «Application security» → **Turnstile**).
2. **Add widget**.
3. **Widget name**: `ANVI`.
4. **Hostnames** — добавить три:
   - `anvi.md`
   - `www.anvi.md`
   - `print.anvi.md`

   (Домен не обязательно должен быть подключён к Cloudflare DNS. Для проверки на превью-ссылках Vercel можно добавить и их, но не обязательно — сотрудники проверку не проходят.)
5. **Widget Mode**: **Managed** (рекомендуется).
6. «Would you like to opt for pre-clearance» — **No**.
7. **Create**. Cloudflare покажет два ключа:
   - **Site Key** (публичный, начинается с `0x4…`);
   - **Secret Key** (секретный — никому не пересылать).

## 2. Прописать ключи в Vercel

Vercel → проект → **Settings → Environment Variables**, окружение **Production** (и Preview, если нужно):

| Переменная | Значение |
|---|---|
| `TURNSTILE_SITE_KEY` | Site Key из Cloudflare |
| `TURNSTILE_SECRET_KEY` | Secret Key из Cloudflare |
| `TURNSTILE_PROTECT_UPLOADER` | не задавать (или `0`). `1` — включить проверку и для заказов без входа на print.anvi.md |

`NEXT_PUBLIC_…` переменная не нужна: публичный ключ сервер сам передаёт на страницу.

После сохранения — **Redeploy** последнего деплоя (переменные подхватываются только новым деплоем).

## 3. Проверить

1. Открыть anvi.md в режиме инкогнито (не как тестер и не в админке), положить товар в корзину, оформить заказ — должен пройти как обычно.
2. Cloudflare → Turnstile → виджет ANVI → **Analytics**: появятся проверки с действиями `checkout` / `login` (и `upload`, если включён флаг).
3. Если заказы вдруг перестали проходить — удалить `TURNSTILE_SECRET_KEY` в Vercel и сделать Redeploy: защита выключится.

## Для разработчиков

- Сервер: `src/lib/turnstile/verify.ts` — `verifyTurnstile(token, { secretKey, ip, action })` (можно использовать в любом новом маршруте, например в форме корпоративных заявок), гарды — `src/lib/turnstile/guard.ts` (`guardShopTurnstile(request, action)`, `guardUploaderTurnstile(request)`).
- Клиент: на странице `<TurnstileScope action="…" lang={lang} />` (серверный компонент, грузит скрипт только там), в обработчике отправки `headers: { ...(await turnstileHeaders()) }`; при ответе 403 `turnstile_failed` — `turnstileRejected()` и текст `turnstileText(lang, "failed")`.
- Тестовые ключи Cloudflare (всегда «прошёл»): site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`; «всегда не прошёл»: site `2x00000000000000000000AB`, secret `2x0000000000000000000000000000000AA`.
- CSP в приложении нет; если появится — разрешить `https://challenges.cloudflare.com` в `script-src` и `frame-src`.
