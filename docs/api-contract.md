# Контракт подключения фронтенда

`app.js` обращается только к `window.platformApi`. Все методы асинхронные.
В случае ошибки адаптер выбрасывает `Error` с безопасным пользовательским сообщением.
Серверные трассировки и секреты в текст ошибок не включать.

## Методы

| Метод | Возвращает | Назначение |
|---|---|---|
| `listTasks()` | `Task[]` | Опубликованные задачи по убыванию рейтинга |
| `getTask(taskId)` | `Task` | Карточка задачи |
| `getQuestions(description)` | `Question[]` | Не менее трёх релевантных вопросов |
| `getDraft()` | `Draft` или `null` | Сохранённый черновик текущего бизнеса |
| `saveDraft(draft)` | `Draft` | Сохранение черновика |
| `rateTask(draft)` | `Rating` | Баллы, критерии и подсказки |
| `publishTask(draft)` | `Task` | Публикация подтверждённой карточки |
| `listOffers(taskId)` | `Offer[]` | Предложения по задаче с учётом прав текущего пользователя |
| `submitOffer(taskId, data)` | `Offer` | Предложение текущей команды |
| `selectTeams(taskId, teamIds)` | `Task` | Подтверждение выбора; пустой массив — ни одной команды |
| `getWorkspace(role)` | `{tasks, offers, stages}` | Данные кабинета текущего пользователя |
| `submitStage(stageId, {result, url})` | `Stage` | Отправка результата на проверку |
| `reviewStage(stageId, approved, feedback)` | `Stage` | Подтверждение или возврат на доработку |

Дополнительное свойство: `meta: {mode: 'demo' | 'live', persistent: boolean}`.
`persistent` означает, что сохранение переживает перезагрузку страницы.
При интеграции заменить подписи о локальном демо-хранилище и демо-оценке реальными.

## Форматы

```js
// Draft: все поля — строки
{
  title, company, category, problem, outcome, success, data, deadline, constraints
}

// Task
{
  ...draft,
  id, ownerId,
  status: 'published' | 'in_progress' | 'closed',
  selectedTeamIds: [], selectionDone: false,
  offerCount: 0,
  rating: {
    total: 0, // 0–100
    breakdown: [{key, label, points, max}],
    hints: ['Какие сведения стоит дополнить']
  }
}

// Question: key соответствует редактируемому полю Draft
{ key: 'outcome', label: 'Что должно получиться?', placeholder: 'Например…' }

// Offer; submitOffer принимает только team, members, approach, duration, contact
{
  id, taskId, teamId, team, members, approach, duration, contact,
  status: 'pending' | 'selected' | 'declined'
}

// Stage
{
  id, taskId, teamId, team, title, points,
  status: 'in_progress' | 'pending' | 'revision' | 'approved',
  result, url, feedback
}
```

`getWorkspace` возвращает только доступные пользователю данные.
В демо фиксированы `business-1` и `team-orbit`: для реального входа замените
эти сравнения в `app.js` значениями из сессии пользователя.
`role` нельзя считать источником серверных прав доступа.
Бизнес видит все предложения только к своим задачам; команда видит только своё.

## Пример адаптера

```js
const request = async (path, options = {}) => {
  const response = await fetch('/api' + path, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) throw new Error('Не удалось выполнить запрос. Попробуйте ещё раз.');
  return response.json();
};
window.platformApi = {
  meta: { mode: 'live', persistent: true },
  listTasks: () => request('/tasks?sort=rating_desc'),
  getTask: id => request('/tasks/' + encodeURIComponent(id)),
  // Остальные методы реализуются по согласованным маршрутам сервера.
};
```

Маршруты `/api` в примере — предложение, а не уже существующий backend.
Идентификаторы в примерах не являются секретами или средствами авторизации.
После отправки предложения UI перечитывает карточку, после подтверждения этапа — кабинет.
Сервер контролирует доступ, валидацию, уникальность предложения и однократность начисления баллов.
Многопользовательское обновление в реальном времени в эту версию интерфейса не включено.

## Живой редактор и автосохранение

`draft-autosave.js` подключается перед `app.js`. Он вызывает существующий `saveDraft`
через 700 мс после ввода и сохраняет неизменяемые снимки последовательно.
`saveDraft` должен завершать Promise после фактического сохранения или выбрасывать ошибку.
Публикация ожидает завершения очереди, чтобы старый запрос не восстановил удалённый черновик.
Серверу также стоит удалять черновик при успешной публикации.

`Rating.breakdown` может дополнительно содержать `hint` для каждого критерия.
`key` должен совпадать с именем поля карточки: нажатие на подсказку фокусирует это поле.
`max - points` используется для отображения потенциальной прибавки баллов.
Расчёт самого рейтинга остаётся ответственностью сервера.

Черновик передаётся как полный снимок. Неполные поля допустимы до публикации.
При ошибке сохранения интерфейс сохраняет введённый текст и предлагает повторить попытку.
Если пользователь закрывает страницу до завершения сохранения, браузер показывает
предупреждение о несохранённых изменениях.
