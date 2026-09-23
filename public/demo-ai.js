/* Explicit offline demonstration. No model requests and no claims of AI-generated facts. */
(() => {
  const split = value => String(value || '').split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
  function turn(input) {
    const description = String(input.description || '').trim();
    if (description.length < 20) throw new Error('Опишите идею подробнее: минимум 20 символов');
    const answers = input.answers || [];
    const values = Object.fromEntries(answers.map(a => [a.key, a.answer]));
    const known = input.knownFields || {};
    const sentence = expression => description.match(expression)?.[1]?.trim() || '';
    const initial = {
      goal: known.need || sentence(/(?:цель|хотим)\s*[:—-]?\s*([^.!?\n]+)/i),
      targetUsers: known.users || (/клиент/i.test(description) ? 'Клиенты' : /студент/i.test(description) ? 'Студенты' : ''),
      requirements: known.requirements || sentence(/(?:функции|требования)\s*[:—-]\s*([^.!?\n]+)/i),
      successCriteria: known.success || sentence(/(?:успех|критерии)\s*[:—-]\s*([^.!?\n]+)/i),
      deadline: known.deadline || sentence(/(\d+(?:\s*[–-]\s*\d+)?\s*(?:недел[а-яё]*|дн[а-яё]*|день|месяц[а-яё]*))/i),
      data: known.data || sentence(/данные\s*[:—-]\s*([^.!?\n]+)/i),
      constraints: known.constraints || '', interactionFormat: known.interactionFormat || '', contact: known.contact || ''
    };
    const context = { ...initial, ...values };
    const answeredKeys = new Set(answers.map(a => a.key));
    for (const key of Object.keys(context)) if (/^(?:пока\s+)?(?:не знаю|не определ|не решил|обсудим)/i.test(context[key])) context[key] = '';
    const questions = [
      { key: 'goal', label: 'Какую главную задачу бизнеса должно решить это решение?', chips: ['Получать больше заявок', 'Сократить ручную работу', 'Информировать клиентов'] },
      { key: 'targetUsers', label: 'Кто будет пользоваться решением?', chips: ['Клиенты', 'Сотрудники', 'Клиенты и администратор'] },
      { key: 'requirements', label: 'Какие действия обязательно должны работать в первой версии?', chips: /бот|запис/i.test(description) ? ['Выбор услуги и времени', 'Запись и отмена записи', 'Запись и уведомление администратора'] : ['Каталог и заявки', 'Форма обратной связи', 'Информация о компании'] },
      { key: 'successCriteria', label: 'Как вы проверите, что проект решает вашу задачу?', chips: ['Пройдём основные сценарии', 'Проверим на реальных пользователях', 'Сравним время обработки заявок'] },
      { key: 'deadline', label: 'Есть ли желаемый срок реализации?', chips: ['2 недели', '1 месяц', 'Срок обсудим с командой'] },
      { key: 'data', label: 'Какие материалы или данные вы сможете предоставить?', chips: ['Готовые тексты и фотографии', 'Обезличенную таблицу', 'Пока нет данных'] },
      { key: 'interactionFormat', label: 'Как вам удобно общаться с командой?', chips: ['Онлайн раз в неделю', 'В Telegram', 'На очных встречах'] }
    ];
    const enough = ['goal', 'targetUsers', 'requirements', 'successCriteria'].every(key => context[key]);
    if (['analyze', 'answer'].includes(input.action) && answers.length < 5 && (!enough || (!answers.length && questions.filter(q => !context[q.key] && !answeredKeys.has(q.key)).length >= 3))) {
      const pending = questions.filter(q => !context[q.key] && !answeredKeys.has(q.key)).slice(0, 5 - answers.length).map(q => ({ ...q, id: q.key }));
      if (pending.length) return { mode: 'demo', provider: 'Демо без AI', status: 'interview', summary: 'Соберём только те детали, которых не хватает в описании.', questions: pending, task: null };
    }
    if (input.currentTask && ['improve', 'regenerate'].includes(input.action)) {
      const task = JSON.parse(JSON.stringify(input.currentTask));
      task.title = task.title.replace(/^MVP · /, '').trim();
      if (input.action === 'regenerate') task.title = 'MVP · ' + task.title;
      return { mode: 'demo', provider: 'Демо без AI', status: 'ready', summary: 'Демо-версия карточки обновлена. Исходные факты сохранены.', questions: [], task };
    }
    const requirements = split(context.requirements);
    const missingInfo = [];
    for (const [key, label] of [['goal', 'Цель бизнеса'], ['targetUsers', 'Пользователи'], ['requirements', 'Обязательные функции'], ['successCriteria', 'Критерии приёмки'], ['deadline', 'Срок'], ['data', 'Данные'], ['contact', 'Контакт бизнеса']]) if (!context[key]) missingInfo.push(label);
    const bot = /telegram|телеграм/i.test(description);
    const task = {
      title: bot && /запис/i.test(description) ? 'Telegram-бот для записи клиентов' : /сайт/i.test(description) ? 'Сайт для бизнеса' : description.replace(/^(нам нужен|нам нужно|нужен|нужно)\s+/i, '').slice(0, 100),
      problem: description, goal: context.goal || '', targetUsers: split(context.targetUsers), requirements,
      expectedResult: known.outcome || (bot ? 'Рабочий прототип Telegram-бота с согласованными функциями.' : 'Рабочий прототип решения с согласованными функциями.'),
      acceptanceCriteria: split(context.successCriteria), requiredSkills: bot ? ['Telegram Bot API'] : [],
      difficulty: null, estimatedDuration: context.deadline || '', recommendedTeamSize: null,
      data: context.data || '', constraints: context.constraints || '', contact: context.contact || '', interactionFormat: context.interactionFormat || '',
      missingInfo, assumptions: ['Это шаблонная демонстрация без обращения к AI. Ожидаемый результат и предложенные навыки требуют вашего подтверждения.']
    };
    return { mode: 'demo', provider: 'Демо без AI', status: 'ready', summary: 'Черновик собран из вашей идеи и ответов. Проверьте формулировки перед публикацией.', questions: [], task };
  }
  window.MostAIDemo = { turn: async input => { await new Promise(resolve => setTimeout(resolve, 550)); return window.MostInterview.ensureMinimum(turn(input), input); } };
})();
