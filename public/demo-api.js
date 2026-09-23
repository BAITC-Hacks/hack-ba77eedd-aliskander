/* DEMO ADAPTER. Replace window.platformApi with your backend adapter.
   All methods return Promises. This file is a browser-only simulation, not a backend. */
(() => {
  'use strict';
  const currentTeam = () => window.platformTeam?.current || { id: 'team-orbit', name: 'Orbit' };
  const KEY = 'most-frontend-demo-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const id = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const criteria = [
    { key: 'problem', label: 'Понятная проблема', max: 20, min: 30, hint: 'Что сейчас не работает и на кого это влияет? Добавьте конкретный пример.' },
    { key: 'outcome', label: 'Ожидаемый результат', max: 20, min: 20, hint: 'Опишите, что команда должна передать: прототип, сайт, исследование или другой результат.' },
    { key: 'success', label: 'Критерии успеха', max: 20, min: 20, hint: 'Как вы проверите результат? Укажите измеримый показатель или сценарий приёмки.' },
    { key: 'data', label: 'Доступные данные', max: 15, min: 15, hint: 'Какие данные, материалы и доступы вы предоставите команде?' },
    { key: 'deadline', label: 'Срок выполнения', max: 15, min: 3, hint: 'Укажите ожидаемый срок выполнения или дату демонстрации.' },
    { key: 'constraints', label: 'Условия и ограничения', max: 10, min: 15, hint: 'Укажите бюджет, ограничения по технологиям и формат взаимодействия.' }
  ];
  function rate(task) {
    const breakdown = criteria.map(c => ({ ...c, points: String(task[c.key] || '').trim().length >= c.min ? c.max : 0 }));
    return { missingDetails: ['need', 'interactionFormat'].filter(key => !String(task[key] || '').trim()).map(key => ({ key, label: key === 'need' ? 'Потребность бизнеса' : 'Формат взаимодействия', hint: key === 'need' ? 'Какую потребность нужно закрыть?' : 'Как будете общаться с командой?' })), total: breakdown.reduce((n, c) => n + c.points, 0), breakdown, hints: breakdown.filter(c => !c.points).map(c => c.hint) };
  }
  const base = { ownerId: 'business-1', status: 'published', success: 'Прототип проходит пять согласованных сценариев; результаты фиксируются на демонстрации.', data: 'Предоставим обезличенные данные и консультации сотрудника компании.', constraints: 'Учебный проект без оплаты. Еженедельная встреча, стек на выбор команды.', selectedTeamIds: [], selectionDone: false };
  const tasks = [
    { ...base, id: 'task-1', title: 'Прогноз спроса для локальной кофейни', company: 'Кофейня «Зёрна»', category: 'Аналитика', deadline: '4 недели', problem: 'Каждый вечер остаётся непроданная выпечка. Хотим понять, сколько готовить с учётом дня недели, погоды и сезонности.', outcome: 'Простой дашборд с прогнозом продаж и рекомендациями по закупке.' },
    { ...base, id: 'task-2', ownerId: 'business-2', title: 'Онлайн-запись в творческую студию', company: 'Студия «Форма»', category: 'Веб-разработка', deadline: '3 недели', problem: 'Записываем участников мастер-классов в мессенджере. Администратор теряет заявки, а клиентам неудобно выбирать время.', outcome: 'Адаптивный сайт с расписанием мастер-классов и формой записи.', constraints: '' },
    { ...base, id: 'task-3', ownerId: 'business-3', title: 'Новый путь пользователя в приложении', company: 'Qadam Education', category: 'Дизайн', deadline: '2 недели', problem: 'Студенты бросают регистрацию на третьем экране. Нужно выяснить причины и сделать начало обучения понятнее.', outcome: 'Исследование и интерактивный прототип нового онбординга.', data: '' },
    { ...base, id: 'task-4', ownerId: 'business-4', title: 'Помощник для службы поддержки', company: 'Nomad Market', category: 'ИИ и автоматизация', deadline: '5 недель', problem: 'Команда поддержки ежедневно отвечает на повторяющиеся вопросы о доставке и возврате товаров. Это увеличивает время ожидания.', outcome: 'Прототип помощника с поиском ответов по базе знаний компании.', success: '' },
    { ...base, id: 'task-5', ownerId: 'business-5', title: 'Исследование аудитории экомагазина', company: 'Taza Store', category: 'Исследования', deadline: '3 недели', problem: 'Планируем запуск подписки на экологичные товары, но пока не понимаем, какие наборы и условия нужны нашим покупателям.', outcome: 'Интервью с клиентами, сегментация аудитории и рекомендации по запуску.', constraints: '', data: '' },
    { ...base, id: 'task-6', ownerId: 'business-6', title: 'Учёт остатков для небольшого склада', company: 'Dala Logistics', category: 'Веб-разработка', deadline: '4 недели', problem: 'Остатки товаров учитываются в разных таблицах. Сотрудники тратят много времени на поиск актуальной информации.', outcome: 'Веб-интерфейс учёта товаров с поиском и журналом изменений.', success: '', constraints: '' }
  ];
  const seed = { tasks, offers: [
    { id: 'offer-1', taskId: 'task-1', teamId: 'team-orbit', team: 'Orbit', members: '3 участника · аналитик, разработчик, дизайнер', approach: 'Изучим историю продаж, построим базовый прогноз и проверим его на отдельной выборке. Покажем рекомендации в веб-дашборде.', duration: '4 недели', contact: 'orbit@example.com', status: 'pending' },
    { id: 'offer-2', taskId: 'task-1', teamId: 'team-vector', team: 'Вектор', members: '4 участника · Python, аналитика, UX', approach: 'Начнём с интервью с бариста. Сравним несколько моделей и подготовим дашборд, который поможет планировать закупки.', duration: '3 недели', contact: 'vector@example.com', status: 'pending' }
  ], stages: [], draft: null };
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* Memory fallback below. */ }
  if (!db || !Array.isArray(db.tasks) || !Array.isArray(db.offers) || !Array.isArray(db.stages)) db = copy(seed);
  let persistent = true;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { persistent = false; } };
  save();
  const findTask = taskId => { const task = db.tasks.find(t => t.id === taskId); if (!task) throw new Error('Задача не найдена.'); return task; };
  const withRating = task => ({ ...task, rating: rate(task), offerCount: db.offers.filter(o => o.taskId === task.id).length });
  const asyncMethod = fn => async (...args) => { await new Promise(resolve => setTimeout(resolve, 130)); return copy(fn(...args)); };
  function finishSelection(taskId, proposalIds) {
    const task = findTask(taskId);
    if (task.ownerId !== 'business-1') throw new Error('Вы можете выбирать команды только для своих задач.');
    if (task.selectionDone) throw new Error('Выбор уже подтверждён.');
    const offers = db.offers.filter(o => o.taskId === taskId);
    if (proposalIds.some(id => !offers.some(o => o.id === id))) throw new Error('Предложение не найдено.');
    const teams = new Map(offers.filter(o => proposalIds.includes(o.id)).map(o => [o.teamId, o]));
    task.selectedTeamIds = [...teams.keys()]; task.selectionDone = true;
    task.status = teams.size ? 'in_progress' : 'closed';
    offers.forEach(o => { o.status = proposalIds.includes(o.id) ? 'selected' : 'declined'; });
    for (const [teamId, offer] of teams) db.stages.push({ id: id('stage'), taskId, teamId, team: offer.team, title: 'Демонстрация рабочего прототипа', points: 100, status: 'in_progress', result: '', url: '', feedback: '' });
    save(); return withRating(task);
  }
  window.platformApi = {
    meta: { mode: 'demo', get persistent() { return persistent; } },
    listTasks: asyncMethod(() => db.tasks.filter(t => t.status !== 'draft').map(withRating).sort((a, b) => b.rating.total - a.rating.total)),
    getTask: asyncMethod(taskId => withRating(findTask(taskId))),
    getQuestions: asyncMethod(description => {
      const text = description.toLowerCase();
      const context = /сайт|запис|приложен/.test(text) ? 'Какие действия пользователь должен выполнять в готовом интерфейсе?' : /прогноз|данн|аналит/.test(text) ? 'Какие решения вы хотите принимать на основе анализа?' : 'Что команда должна передать вам в конце работы?';
      return [
        { key: 'outcome', label: context, placeholder: 'Например: дашборд с прогнозом продаж на следующую неделю' },
        { key: 'need', label: 'Какую потребность бизнеса должно закрыть решение?', placeholder: 'Например: снизить списания продуктов' },
        { key: 'interactionFormat', label: 'Как вы будете взаимодействовать с командой?', placeholder: 'Онлайн-встреча раз в неделю, контактное лицо' },
        { key: 'success', label: 'Как вы поймёте, что задача решена успешно?', placeholder: 'Конкретный показатель или сценарий проверки результата' },
        { key: 'data', label: 'Какие данные и материалы вы сможете предоставить?', placeholder: 'Обезличенная история продаж, доступ к макетам, интервью…' },
        { key: 'deadline', label: 'Когда нужен результат?', placeholder: 'Например: за 4 недели' },
        { key: 'constraints', label: 'Какие есть условия и ограничения?', placeholder: 'Бюджет, технологии, конфиденциальность, время для встреч' }
      ];
    }),
    getDraft: asyncMethod(() => db.draft),
    saveDraft: asyncMethod(draft => { db.draft = draft; save(); return draft; }),
    rateTask: asyncMethod(rate),
    publishTask: asyncMethod(draft => {
      const task = { ...draft, id: id('task'), ownerId: 'business-1', status: 'published', selectedTeamIds: [], selectionDone: false };
      db.tasks.unshift(task); db.draft = null; save(); return withRating(task);
    }),
    listOffers: asyncMethod(taskId => db.offers.filter(o => o.taskId === taskId)),
    submitOffer: asyncMethod((taskId, data) => {
      const task = findTask(taskId);
      if (task.status !== 'published' || task.selectionDone) throw new Error('Приём предложений завершён.');

      const offer = { ...data, id: id('offer'), taskId, teamId: currentTeam().id, team: currentTeam().name, status: 'pending' };
      db.offers.push(offer); save(); return offer;
    }),
    decideOffer: asyncMethod((offerId, status) => {
      const offer = db.offers.find(o => o.id === offerId);
      if (!offer || !['selected', 'declined'].includes(status)) throw new Error('Предложение или решение не найдено.');
      const task = findTask(offer.taskId);
      if (task.ownerId !== 'business-1' || task.selectionDone) throw new Error('Решение недоступно.');
      offer.status = status; save(); return offer;
    }),
    selectOffers: asyncMethod(finishSelection),
    selectTeams: asyncMethod((taskId, teamIds) => finishSelection(taskId, db.offers.filter(o => o.taskId === taskId && teamIds.includes(o.teamId)).map(o => o.id))),
    getWorkspace: asyncMethod(role => role === 'business'
      ? { tasks: db.tasks.filter(t => t.ownerId === 'business-1').map(withRating), offers: db.offers, stages: db.stages.filter(s => findTask(s.taskId).ownerId === 'business-1') }
      : { tasks: db.tasks.filter(t => db.offers.some(o => o.taskId === t.id && o.teamId === currentTeam().id)).map(withRating), offers: db.offers.filter(o => o.teamId === currentTeam().id), stages: db.stages.filter(s => s.teamId === currentTeam().id) }),
    submitStage: asyncMethod((stageId, data) => {
      const stage = db.stages.find(s => s.id === stageId);
      if (!stage || stage.teamId !== currentTeam().id || !['in_progress', 'revision'].includes(stage.status)) throw new Error('Этот этап недоступен для отправки.');
      stage.result = data.result; stage.url = data.url; stage.status = 'pending'; save(); return stage;
    }),
    reviewStage: asyncMethod((stageId, approved, feedback) => {
      const stage = db.stages.find(s => s.id === stageId);
      if (!stage || findTask(stage.taskId).ownerId !== 'business-1' || stage.status !== 'pending') throw new Error('Этап уже проверен или недоступен.');
      stage.status = approved ? 'approved' : 'revision'; stage.feedback = feedback || ''; save(); return stage;
    })
  };
})();
