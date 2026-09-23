# Интеграция интерфейса с сервером команды

Главная страница подключает `public/api-client.js`, который объявляет `window.platformApi`.
Отдельная `/demo.html` подключает `public/demo-api.js` с тем же контрактом.
Оба адаптера используют общий `public/app.js` и `public/draft-autosave.js`.

Актуальные права, аккаунты и этапы: [изменения после оценки MVP](jury-review.md).

## Маршруты задач

| HTTP | Маршрут | Действие |
|---|---|---|
| GET | `/api/tasks` | Опубликованные задачи по убыванию серверного рейтинга |
| GET | `/api/tasks?all=true` | Бизнес: свои задачи и черновики; команда: опубликованные задачи |
| POST | `/api/tasks` | Создать черновик |
| GET / PATCH | `/api/tasks/:id` | Прочитать / обновить задачу |
| POST | `/api/tasks/:id/publish` | Опубликовать |
| GET / POST | `/api/tasks/:id/proposals` | Список / отправка предложений |
| PATCH | `/api/proposals/:id/status` | Исходное ручное решение `selected` / `rejected` |

## Добавленные маршруты для интерфейса

| HTTP | Маршрут | Тело запроса |
|---|---|---|
| POST | `/api/rating` | Поля задачи в серверных именах; ответ: score, level, missingFields, breakdown |
| POST | `/api/questions` | Заполненные поля; ответ: минимум 3 шаблонных вопроса |
| POST | `/api/tasks/:id/selection` | `{teamIds: [...]}`; пустой массив означает завершить без выбора |
| GET | `/api/stages` | Этапы текущей команды или собственных бизнес-задач |
| POST | `/api/stages/:id/submit` | `{result, url}` |
| POST | `/api/stages/:id/review` | `{approved: true/false, feedback}` |

Пакетный выбор атомарно закрывает приём предложений, выставляет статусы и создаёт этапы.
После подтверждения выбора старый одиночный маршрут решений возвращает 409.
Этап проходит `in_progress → pending → approved` или `pending → revision → pending`.
Баллы равны сумме points только для approved; повторное подтверждение возвращает 409.

## Сопоставление полей

| Интерфейс | Сервер |
|---|---|
| problem | context |
| outcome | expectedResult |
| success | successCriteria |
| rating.total | score |
| rating.level | level |
| team | teamName |
| approach | idea |
| duration | deadline предложения |
| declined | rejected |

`title`, `company`, `category`, `deadline` задачи, `data`, `constraints`, `users`, `contact`
сохраняются без переименования. У предложения также сохраняются `plan`, `prototypeUrl`,
`teamId`, `members`, `contact`.
У старых предложений без teamId адаптер использует id предложения для выбора.

Критерии, веса и уровни заданы в общем `public/readiness-engine.cjs`. Его использует сервер через `src/rating.js` и редактор для локального пересчёта. AI-рекомендации не меняют рейтинг.
`breakdown` формируется сервером: `{key, label, points, max, hint}`.
Адаптер переводит `key` в имя поля формы для перехода по подсказке.

## Черновик

Сервер сохраняет черновик как неопубликованную задачу.
В localStorage основной страницы хранится только указатель `most-server-draft-id`.
Если указателя нет, можно восстановить неопубликованную задачу из собственного кабинета.
`openDraft(id)` выбирает конкретный черновик; опубликованную задачу открыть как черновик нельзя.

`draft-autosave.js` объединяет ввод за 700 мс и отправляет полные снимки последовательно.
Публикация дожидается очереди, сохраняет текущие поля, публикует ту же задачу и очищает указатель.
Ошибка сохранения отображается в форме; повторная попытка не теряет введённый текст.

## Авторизация

Основной сервер использует аккаунты и HttpOnly-сессии. Владельца задачи и идентификатор команды определяет сервер; чужие черновики, профили, отклики и этапы не выдаются. Переключение ролей осталось только в автономном `/demo.html`. Подробный [контракт аккаунтов и прав](jury-review.md#аккаунты-и-права).

## Дополнение по минимальным требованиям

- `need` и `interactionFormat` сохраняются и возвращаются вместе с задачей.
  Серверная разбивка содержит `missingDetails` для этих полей; исходные веса рейтинга не менялись.
- Каталог фильтрует темы и уровни 0–39, 40–69, 70–89, 90–100, сохраняя порядок рейтинга.
- `submitOffer` допускает любое количество откликов от одной команды, пока приём открыт.
- `decideOffer(offerId, 'selected' | 'declined')` вызывает существующий PATCH статуса.
  Решение относится к конкретному отклику, а не ко всем откликам его команды.
- `selectOffers(taskId, proposalIds)` вызывает POST `/api/tasks/:id/selection`
  с `{proposalIds: [...]}`. Это атомарное подтверждение выбранных вариантов;
  пустой список означает завершение без выбора. Старый `{teamIds: [...]}` тоже поддерживается.
- `public/team-session.js` предоставляет `window.platformTeam.current` и `.set(name)`.
  Адаптер использует активную команду при отправке отклика и открытии кабинета.
  В основной версии `.current` возвращает пользователя серверной сессии.
- Этапы создаются только после явного подтверждения бизнеса, по 2–3 этапа из согласованного плана на каждую выбранную команду.

## OpenAI и расширенная карточка

- `GET /api/ai/status` → `{configured: boolean, provider: "OpenAI"}`. Ключ не возвращается.
- `POST /api/ai/interview` → структурированное интервью либо карточка. Действия:
  `analyze`, `answer`, `improve`, `regenerate`. Этот маршрут не создаёт и не публикует задачи.
- `platformApi.getAIStatus()` и `platformApi.aiTurn(input)` — методы серверного адаптера.
- Старый `/api/questions` сохранён для совместимости; новый конструктор его не вызывает.
- Дополнительные строковые поля хранилища: `requirements`, `requiredSkills`, `difficulty`,
  `recommendedTeamSize`, `aiSession`, `aiAssumptions`, `aiMissingInfo`.
- AI-массивы `targetUsers`, `requirements`, `acceptanceCriteria` отображаются в редакторе
  строками через переносы; навыки — через запятые. `goal → need`, `problem → context`,
  `estimatedDuration → deadline`. Схема исходного рейтинга не изменена.
- `aiSession` — JSON-строка с исходной идеей, вопросами, ответами, неотправленным текстом
  и предыдущей версией карточки. При открытии черновика продолжается незавершённое интервью.

Полная форма запросов и рекомендации для подключения:
[ai-task-generator.md](ai-task-generator.md).

## AI Match и профиль участника

`POST /api/match` считает `{student, task}` по весам 50/20/10/10/10;
`POST /api/match/explain` добавляет только AI-текст, не меняя процент.
`GET / PUT /api/students/:id/profile` читает и сохраняет профиль представителя команды.
Недельная нагрузка задачи хранится в `requiredHours` строкой для совместимости с редактором.

Методы адаптера: `getProfile()`, `saveProfile(student)`, `matchTask(student, task, explain=false)`.
Новые предложения получают серверные `studentProfile` и `matchSnapshot`, доступные бизнесу.
Профиль сохраняется в `students`, подтверждённые этапы добавляются как `completedTasks`.
Низкий Match не блокирует отклик; автоматическое назначение не добавлено.

Полная формула и контракт: [ai-match.md](ai-match.md).

## Explore Tasks

Новый UI вызывает `listCatalog(query, student, signal)` → `/api/tasks?view=catalog`.
Ответ `{items,pagination,facets,matchAvailable,sort}` включает Match и число команд
с откликами, поэтому отдельные запросы на каждую карточку не нужны.
Прежние `/api/tasks` без параметров и `?all=true` сохраняют формат массива.

`saveTask(id,saved)` → `PUT /api/students/:studentId/saved/:taskId`.
Данные записываются в `savedTasks` без изменения профиля и существующих задач.

Новые строковые поля задачи: `durationWeeks`, `teamSize`, `workFormat`, `applicationDeadline`.
Сервер назначает `createdAt` и `publishedAt`; старый `deadline` остаётся длительностью.
Отклик после applicationDeadline возвращает 409 независимо от состояния фронтенда.
Полные query-параметры и границы: [task-catalog.md](task-catalog.md).
