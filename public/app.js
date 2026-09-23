const $ = selector => document.querySelector(selector);
let currentId = '';
async function api(path, method = 'GET', data) {
  const response = await fetch(`/api${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function run(action) {
  return async event => {
    event?.preventDefault();
    try { await action(); }
    catch (error) { $('#message').textContent = error.message; }
  };
}
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function showTask(task) {
  currentId = task.id;
  for (const input of $('#task-form').elements) {
    if (input.name) input.value = task[input.name];
  }
  $('#publish').disabled = task.published;
  $('#rating').textContent = `${task.score}/100 — ${task.level}. ${task.published ? 'Опубликована' : 'Не опубликована'}\nДобавьте: ${task.missingFields.join(', ') || 'все поля заполнены'}`;
}
async function proposals() {
  const container = $('#proposals');
  container.replaceChildren();
  if (!currentId) return;
  const items = await api(`/tasks/${currentId}/proposals`);
  if (!items.length) container.append(element('p', 'Откликов пока нет.'));
  for (const item of items) {
    const card = element('article', '');
    card.append(element('h4', `${item.teamName} — ${item.status}`));
    card.append(element('p', `Идея: ${item.idea}\nПлан: ${item.plan}\nСрок: ${item.deadline}\nПрототип: ${item.prototypeUrl || 'не указан'}`));
    for (const [status, label] of [['selected', 'Выбрать'], ['rejected', 'Отклонить']]) {
      const button = element('button', label);
      button.disabled = item.status === status;
      button.onclick = run(async () => {
        await api(`/proposals/${item.id}/status`, 'PATCH', { status });
        await proposals();
      });
      card.append(button);
    }
    container.append(card);
  }
}
async function refresh() {
  const [all, published] = await Promise.all([api('/tasks?all=true'), api('/tasks')]);
  $('#saved').replaceChildren(new Option('Новая задача', ''), ...all.map(task => new Option(task.title || 'Без названия', task.id)));
  $('#saved').value = currentId;
  const selectedTask = $('#proposal-task').value;
  $('#proposal-task').replaceChildren(...published.map(task => new Option(task.title || 'Без названия', task.id)));
  if (published.some(task => task.id === selectedTask)) $('#proposal-task').value = selectedTask;
  $('#catalog').replaceChildren();
  for (const task of published) {
    const card = element('article', '');
    card.append(element('h3', `${task.title || 'Без названия'} — ${task.score}/100 (${task.level})`));
    for (const [key, label] of Object.entries({ context: 'Контекст', users: 'Пользователи', data: 'Данные', expectedResult: 'Результат', successCriteria: 'Критерии успеха', constraints: 'Ограничения', contact: 'Контакт' })) {
      if (task[key]) card.append(element('p', `${label}: ${task[key]}`));
    }
    const button = element('button', 'Предложить решение');
    button.onclick = () => { $('#proposal-task').value = task.id; $('#proposal-form').scrollIntoView(); };
    card.append(button);
    $('#catalog').append(card);
  }
  await proposals();
}
async function save() {
  const values = Object.fromEntries(new FormData($('#task-form')));
  const task = await api(currentId ? `/tasks/${currentId}` : '/tasks', currentId ? 'PATCH' : 'POST', values);
  showTask(task);
  await refresh();
  $('#message').textContent = 'Задача сохранена. Рейтинг пересчитан.';
}
$('#task-form').onsubmit = run(save);
$('#publish').onclick = run(async () => {
  await save();
  showTask(await api(`/tasks/${currentId}/publish`, 'POST'));
  await refresh();
  $('#message').textContent = 'Задача опубликована.';
});
$('#saved').onchange = run(async () => {
  currentId = $('#saved').value;
  if (currentId) showTask(await api(`/tasks/${currentId}`));
  else {
    $('#task-form').reset();
    $('#publish').disabled = true;
    $('#rating').textContent = 'Сохраните новую задачу для расчета рейтинга.';
  }
  await proposals();
});
$('#proposal-form').onsubmit = run(async () => {
  const { taskId, ...values } = Object.fromEntries(new FormData($('#proposal-form')));
  await api(`/tasks/${taskId}/proposals`, 'POST', values);
  $('#proposal-form').reset();
  $('#proposal-task').value = taskId;
  await proposals();
  $('#message').textContent = 'Предложение отправлено: pending. Бизнес может выбрать задачу в кабинете и принять решение.';
});
$('#refresh').onclick = run(refresh);
run(refresh)();
