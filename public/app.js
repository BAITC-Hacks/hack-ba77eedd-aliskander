/* UI only. API contract is described in docs/api-contract.md. */
(() => {
  'use strict';
  const api = window.platformApi;
  const app = document.querySelector('#app');
  const roleSelect = document.querySelector('#role');
  const currentTeam = () => window.platformTeam.current;
  const readinessLevels = [
    { label: 'Черновик · 0–39', min: 0, max: 39 },
    { label: 'Рабочая · 40–69', min: 40, max: 69 },
    { label: 'Готовая · 70–89', min: 70, max: 89 },
    { label: 'Приоритетная · 90–100', min: 90, max: 100 }
  ];
  const categories = ['Аналитика', 'Веб-разработка', 'Дизайн', 'ИИ и автоматизация', 'Исследования'];
  const state = { role: 'business', draft: null, questions: [], filter: '', readiness: '', search: '', ticket: 0, tab: 'tasks' };
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const url = value => { try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) ? h(parsed.href) : ''; } catch (_) { return ''; } };
  const taskStatus = { draft: 'Черновик', published: 'Приём предложений', in_progress: 'В работе', closed: 'Завершена без выбора' };
  const offerStatus = { pending: 'На рассмотрении', selected: 'Вы выбраны', declined: 'Не выбраны' };
  const stageStatus = { in_progress: 'В работе', pending: 'На проверке', revision: 'Нужна доработка', approved: 'Подтверждён' };
  const go = path => { if (location.hash === '#' + path) render(); else location.hash = path; };
  const saveLabels = {
    idle: 'Изменения сохраняются автоматически',
    pending: 'Есть изменения · сохраняем через мгновение',
    saving: 'Сохраняем черновик…',
    saved: '✓ Черновик сохранён',
    error: 'Не удалось сохранить · нажмите «Сохранить сейчас»'
  };
  function updateSaveStatus(status) {
    const el = document.querySelector('#draft-save-status');
    if (!el) return;
    el.dataset.status = status;
    el.textContent = status === 'saved' && !api.meta.persistent
      ? 'Сохранено только до закрытия страницы' : saveLabels[status];
  }
  const autosave = window.createDraftAutosave({
    save: snapshot => api.saveDraft(snapshot),
    onStatus: updateSaveStatus
  });
  let toastTimer;
  function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500); }
  function confirmAction(title, message) {
    const dialog = document.querySelector('#confirm-dialog');
    document.querySelector('#confirm-title').textContent = title;
    document.querySelector('#confirm-text').textContent = message;
    dialog.returnValue = ''; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }
  async function action(button, work) {
    if (button?.disabled) return;
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    try { await work(); } catch (error) { toast(error.message || 'Не удалось выполнить действие. Попробуйте ещё раз.'); }
    finally { if (button?.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); } }
  }
  function empty(title, description, link = '') { return `<div class="empty"><h3>${h(title)}</h3><p class="muted">${h(description)}</p>${link}</div>`; }
  function field(name, label, value = '', options = {}) {
    return `<label class="field">${h(label)}${options.hint ? `<small>${h(options.hint)}</small>` : ''}${options.area ? `<textarea name="${h(name)}" ${options.required ? 'required' : ''} maxlength="3000" placeholder="${h(options.placeholder || '')}">${h(value)}</textarea>` : `<input name="${h(name)}" type="${options.type || 'text'}" value="${h(value)}" ${options.required ? 'required' : ''} maxlength="${options.max || 200}" placeholder="${h(options.placeholder || '')}">`}</label>`;
  }
  const categoryField = value => `<label class="field">Направление<select name="category">${categories.map(c => `<option ${c === value ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>`;
  function card(task) {
    return `<a class="card" href="#task/${encodeURIComponent(task.id)}"><div class="card-top"><span class="tag ${task.category === 'Дизайн' ? 'orange' : task.category === 'Веб-разработка' ? 'blue' : ''}">${h(task.category)}</span><span class="ready">● ${task.rating.total}% готовности</span></div><h3>${h(task.title)}</h3><p>${h(task.problem.length > 135 ? task.problem.slice(0, 135) + '…' : task.problem)}</p><div class="company"><span class="company-icon">${h(task.company.charAt(0))}</span>${h(task.company)}</div><div class="card-bottom"><span>${h(task.deadline || 'Срок обсуждается')} · ${h(taskStatus[task.status])}</span><span class="arrow" aria-hidden="true">↗</span></div></a>`;
  }
  function renderCards(tasks) {
    const level = state.readiness === '' ? null : readinessLevels[Number(state.readiness)];
    const found = tasks.filter(t => (!level || (t.rating.total >= level.min && t.rating.total <= level.max)) && (!state.filter || t.category === state.filter) && `${t.title} ${t.problem} ${t.company}`.toLowerCase().includes(state.search.toLowerCase()));
    document.querySelector('#cards').innerHTML = found.length ? found.map(card).join('') : empty('Пока ничего не нашли', 'Попробуйте другое слово или выберите все направления.');
    document.querySelector('#result-count').textContent = `Найдено: ${found.length}`;
  }
  function catalog(tasks) {
    app.innerHTML = `<section class="hero"><div><div class="eyebrow"><span class="dot"></span>Бизнес встречает новые таланты</div><h1>Ваши задачи.<br>Их идеи.<br><em>Общий результат.</em></h1><p>Бизнес находит свежий взгляд на свои задачи.<br>Студенческие команды — опыт, который имеет значение.</p><a class="btn light" href="${state.role === 'business' ? '#create/1' : '#catalog-list'}">${state.role === 'business' ? 'Предложить задачу' : 'Найти задачу'} <span aria-hidden="true">↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="mini-card"><div class="eyebrow">От идеи к результату</div><h3>Большие решения<br>начинаются<br>с вашей задачи.</h3><div class="mini-row"><span>Ясная цель — уверенный старт</span><span>↗</span></div><div class="bar"><span style="width:88%"></span></div></div><div class="float-badge">✦ Вместе — больше возможностей</div></div></section><div class="stats"><div class="stat"><strong>${tasks.length}</strong><span>задач в каталоге</span></div><div class="stat"><strong>${new Set(tasks.map(t => t.company)).size}</strong><span>компаний</span></div><div class="stat"><strong>${categories.length}</strong><span>направлений</span></div><div class="stat"><span>Открыто для любой студенческой команды</span></div></div><section id="catalog-list"><div class="section-head"><div><div class="eyebrow muted">Найдите свою точку роста</div><h2 style="margin-top:10px">Задачи, с которых всё начинается</h2><div class="muted">Сначала самые проработанные — по рейтингу готовности.</div></div></div><div class="filters"><label class="search"><span class="visually-hidden">Поиск задач</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input id="search" placeholder="Название, компания или ключевое слово" value="${h(state.search)}"></label><label><span class="visually-hidden">Направление</span><select id="category"><option value="">Все направления</option>${categories.map(c => `<option ${state.filter === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label><label><span class="visually-hidden">Уровень готовности</span><select id="readiness"><option value="">Любая готовность</option>${readinessLevels.map((level, i) => `<option value="${i}" ${state.readiness === String(i) ? 'selected' : ''}>${h(level.label)}</option>`).join('')}</select></label></div><p class="muted" id="result-count" aria-live="polite"></p><div class="grid" id="cards"></div></section>`;
    renderCards(tasks);
    document.querySelector('#search').addEventListener('input', event => { state.search = event.target.value; renderCards(tasks); });
    document.querySelector('#category').addEventListener('change', event => { state.filter = event.target.value; renderCards(tasks); });
    document.querySelector('#readiness').addEventListener('change', event => { state.readiness = event.target.value; renderCards(tasks); });
    if (location.hash === '#catalog-list') document.querySelector('#catalog-list').scrollIntoView({ behavior: 'smooth' });
  }
  function steps(step) { return `<ol class="steps">${['Описание', 'Уточнение', 'Карточка', 'Публикация'].map((label, i) => `<li class="${step === i + 1 ? 'current' : step > i + 1 ? 'done' : ''}" ${step === i + 1 ? 'aria-current="step"' : ''}>0${i + 1} / ${label}</li>`).join('')}</ol>`; }
  function ratingPanel(rating, editable = false) {
    const total = Math.max(0, Math.min(100, Number(rating.total) || 0));
    const missing = rating.breakdown.filter(c => c.points < c.max);
    const level = rating.level || (total >= 80 ? 'Хорошо проработана' : total >= 50 ? 'Уже обретает форму' : 'Добавим больше ясности');
    return `<div class="eyebrow muted">Готовность задачи</div>
      <div class="rating-summary"><div class="score-ring" style="--progress:${total}%" role="progressbar" aria-label="Рейтинг готовности" aria-valuenow="${total}" aria-valuemin="0" aria-valuemax="100"><div><strong>${total}</strong><span>из 100</span></div></div><div><h3>${level}</h3><p class="muted">${missing.length ? 'Чёткие детали помогают командам предложить точное решение.' : 'Все критерии полноты заполнены. Можно двигаться дальше.'}</p></div></div>
      <ul class="rating-criteria">${rating.breakdown.map(c => `<li class="${c.points >= c.max ? 'complete' : ''}"><span class="criterion-icon" aria-hidden="true">${c.points >= c.max ? '✓' : '○'}</span><span>${h(c.label)}</span><strong>${h(c.points)}<small> / ${h(c.max)}</small></strong></li>`).join('')}</ul>
      ${missing.length ? `<div class="improvement-head"><strong>Усильте свою задачу</strong><span>Ещё +${missing.reduce((sum, c) => sum + c.max - c.points, 0)}</span></div><div class="improvements">${missing.map((c, i) => {
        const content = `<span><strong>${h(c.label)}</strong><small>${h(c.hint || rating.hints[i] || 'Дополните сведения по этому критерию.')}</small></span><b>+${h(c.max - c.points)}</b>`;
        return editable ? `<button type="button" class="improvement" data-focus-field="${h(c.key)}" aria-label="Дополнить: ${h(c.label)}. Ещё ${h(c.max - c.points)} баллов">${content}</button>` : `<div class="improvement">${content}</div>`;
      }).join('')}</div>` : '<div class="hint">✓ Командам будет проще оценить задачу и подготовить предметное предложение.</div>'}
      ${(rating.missingDetails || []).length ? `<div class="extra-details"><strong>Ещё не указано в карточке</strong>${rating.missingDetails.map(c => editable ? `<button class="improvement" type="button" data-focus-field="${h(c.key)}"><span><strong>${h(c.label)}</strong><small>${h(c.hint)}</small></span><b>↗</b></button>` : `<p class="muted">${h(c.label)}: ${h(c.hint)}</p>`).join('')}<p class="muted rating-note">Эти поля дополняют карточку; отдельные баллы за них не начисляются.</p></div>` : ''}
      ${api.meta.mode === 'demo' ? '<p class="muted rating-note">Демо-рейтинг отражает полноту заполнения.</p>' : ''}`;
  }
  function draftPreview(draft, rating) {
    return `<div class="preview-heading"><div><div class="eyebrow muted">Глазами команды</div><h3>Ваша будущая карточка</h3></div><span class="live-label"><i></i>Превью</span></div>
      <article class="card preview-card"><div class="card-top"><span class="tag">${h(draft.category || 'Направление')}</span><span class="ready">${rating ? rating.total + '% готовности' : 'Оцениваем…'}</span></div><h3>${h(draft.title.trim() || 'Название вашей задачи')}</h3><p>${h(draft.problem.trim() || 'Здесь появится описание проблемы. Начните заполнять форму слева.')}</p><div class="company"><span class="company-icon">${h((draft.company || 'М').charAt(0))}</span>${h(draft.company || 'Ваша компания')}</div><div class="card-bottom"><span>${h(draft.deadline || 'Срок обсуждается')}</span><span class="tag">Предпросмотр</span></div></article>
      <div class="preview-outcome"><span class="eyebrow muted">Ожидаемый результат</span><p>${h(draft.outcome.trim() || 'Что получит бизнес после выполнения задачи?')}</p></div>`;
  }
  async function createPage(step, ticket) {
    if (state.role !== 'business') { app.innerHTML = empty('Создание задач доступно бизнесу', 'Для демонстрации выберите роль «Бизнес» в шапке.'); return; }
    if (!state.draft) state.draft = await api.getDraft() || { problem: '', title: '', company: api.meta.mode === 'demo' ? 'Кофейня «Зёрна»' : '', users: '', contact: '', need: '', interactionFormat: '', category: 'Аналитика', outcome: '', success: '', data: '', deadline: '', constraints: '' };
    if (ticket !== state.ticket) return;
    const d = state.draft;
    if (step > 1 && !d.problem.trim()) { go('create/1'); return; }
    if (step === 2 && !state.questions.length) state.questions = await api.getQuestions(d.problem);
    if (ticket !== state.ticket) return;
    const heading = step === 1 ? 'Всё начинается с вашей задачи' : step === 2 ? 'Добавим немного конкретики' : 'Проверьте карточку перед публикацией';
    const subtitle = step === 1 ? 'Расскажите о потребности своими словами. Мы поможем превратить её в понятную задачу.' : step === 2 ? 'Ответы помогут командам понять контекст и предложить подходящее решение.' : 'Вы можете изменить любое поле. Чем понятнее задача, тем проще найти свою команду.';
    app.innerHTML = `<a class="back" href="#catalog">← В каталог</a><div class="intro"><div class="eyebrow muted">Новая задача</div><h1 class="page-title" style="margin-top:12px">${heading}</h1><p class="muted">${subtitle}</p></div>${steps(step)}<div class="layout"><form id="draft-form" class="panel"><div class="editor-toolbar"><span class="editor-label">Черновик задачи</span><span id="draft-save-status" class="save-status" role="status" aria-live="polite"></span></div>${step === 1 ? `${field('problem', 'Какую проблему вы хотите решить?', d.problem, { area: true, required: true, placeholder: 'Например: у нас небольшая кофейня. Хотим прогнозировать спрос на выпечку, чтобы меньше списывать продукты.', hint: 'Опишите текущую ситуацию, кого она затрагивает и что хотелось бы изменить.' })}<div class="notice">Не нужно готовить техническое задание. Начните с описания — дальше система задаст уточняющие вопросы.</div>` : step === 2 ? state.questions.map((q, i) => `<div><h3 class="subheading"><span class="number">${i + 1}</span>Вопрос ${i + 1}</h3>${field(q.key, q.label, d[q.key], { area: q.key !== 'deadline', placeholder: q.placeholder })}</div>`).join('') + '<p class="muted">Если ответа пока нет, оставьте поле пустым. Недостающие сведения будут отмечены в рейтинге.</p>' : `${field('title', 'Название задачи', d.title, { required: true, max: 110, placeholder: 'Краткое и конкретное название' })}<div class="two">${field('company', 'Компания', d.company, { required: true, max: 100 })}${categoryField(d.category)}</div>${field('problem', 'Контекст и проблема', d.problem, { area: true, required: true })}${field('need', 'Потребность бизнеса', d.need, { area: true, placeholder: 'Что нужно изменить или улучшить в работе бизнеса?' })}${field('outcome', 'Ожидаемый результат', d.outcome, { area: true })}${field('success', 'Критерии успеха', d.success, { area: true })}${field('data', 'Данные и материалы', d.data, { area: true })}${field('users', 'Для кого создаётся решение', d.users, { area: true })}${field('contact', 'Контакт бизнеса', d.contact, { placeholder: 'Email, телефон или Telegram' })}${field('interactionFormat', 'Формат взаимодействия', d.interactionFormat, { area: true, placeholder: 'Например: онлайн-встреча раз в неделю, обратная связь в Telegram' })}${field('deadline', 'Срок выполнения', d.deadline)}${field('constraints', 'Условия и ограничения', d.constraints, { area: true })}<label class="check-label"><input type="checkbox" name="confirmed" required>Я проверил(а) карточку и подтверждаю публикацию в общем каталоге.</label>`}<div class="actions">${step > 1 ? `<button type="button" class="btn secondary" id="previous">← Назад</button>` : ''}<button class="btn" type="submit">${step === 1 ? 'Уточнить задачу' : step === 2 ? 'Сформировать карточку' : 'Подтвердить и опубликовать'} <span aria-hidden="true">→</span></button><button type="button" class="btn secondary" id="save-draft">Сохранить сейчас</button></div></form><aside class="editor-sidebar"><div class="panel preview-panel" id="draft-preview"></div><div class="panel" id="rating-panel"><div class="loading">Оцениваем полноту карточки…</div></div></aside></div>`;
    const form = document.querySelector('#draft-form');
    const capture = () => { for (const [key, value] of new FormData(form)) if (key !== 'confirmed') d[key] = String(value); };
    let ratingTicket = 0;
    let latestRating = null;
    let debounce;
    let submitting = false;
    const preview = () => { if (ticket === state.ticket) document.querySelector('#draft-preview').innerHTML = draftPreview(d, latestRating); };
    const refreshRating = async () => {
      const current = ++ratingTicket;
      const rating = await api.rateTask({ ...d });
      if (ticket === state.ticket && current === ratingTicket) {
        latestRating = rating;
        document.querySelector('#rating-panel').innerHTML = ratingPanel(rating, step === 3);
        preview();
      }
    };
    updateSaveStatus(autosave.status);
    preview();
    document.querySelector('#rating-panel').addEventListener('click', event => {
      const button = event.target.closest('[data-focus-field]');
      if (!button) return;
      const target = form.elements.namedItem(button.dataset.focusField);
      if (target) { target.focus(); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else if (step !== 3) { go('create/3'); }
    });
    form.addEventListener('input', event => {
      if (submitting || event.target.name === 'confirmed') return;
      capture();
      if (form.elements.namedItem('confirmed')) form.elements.namedItem('confirmed').checked = false;
      autosave.update(d);
      ratingTicket += 1;
      latestRating = null;
      preview();
      clearTimeout(debounce);
      debounce = setTimeout(() => refreshRating().catch(error => toast(error.message)), 250);
    });
    document.querySelector('#save-draft').onclick = event => action(event.currentTarget, async () => {
      capture(); autosave.update(d); await autosave.flush();
      toast(api.meta.persistent ? 'Черновик сохранён' : 'Черновик сохранён до закрытия страницы');
    });
    if (step > 1) document.querySelector('#previous').onclick = () => { capture(); go(`create/${step - 1}`); };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submitting) return;
      capture();
      action(event.submitter, async () => {
        submitting = true;
        form.inert = true;
        try {
        if (!d.problem.trim()) throw new Error('Добавьте описание проблемы.');
        if (step === 1) { state.questions = await api.getQuestions(d.problem); autosave.update(d); await autosave.flush(); go('create/2'); }
        else if (step === 2) { if (!d.title) d.title = d.problem.split(/[.!?\n]/)[0].slice(0, 100); autosave.update(d); await autosave.flush(); go('create/3'); }
        else {
          if (!d.title.trim() || !d.company.trim()) throw new Error('Укажите название задачи и компанию.');
          clearTimeout(debounce); await autosave.flush();
          const task = await api.publishTask({ ...d }); autosave.reset(); state.draft = null; state.questions = []; go(`published/${encodeURIComponent(task.id)}`);
        }
        } finally { submitting = false; form.inert = false; }
      });
    });
    await refreshRating();
  }
  function published(task) {
    app.innerHTML = `<div class="intro"><div class="eyebrow muted">Готово к новым решениям</div><h1 class="page-title" style="margin-top:16px">Ваша задача уже в каталоге</h1><p class="muted">Команды могут изучить карточку и предложить свой подход. Решение о сотрудничестве остаётся за вами.</p></div>${steps(4)}<div class="layout"><div class="panel"><span class="tag">Опубликована</span><h2 style="margin-top:20px">${h(task.title)}</h2><p class="muted">${h(task.company)} · ${h(task.category)}</p><div class="notice">Рейтинг готовности: <strong>${task.rating.total} из 100</strong>. Карточки в каталоге упорядочены по убыванию рейтинга.</div><div class="actions"><a class="btn" href="#task/${encodeURIComponent(task.id)}">Посмотреть задачу ↗</a><a class="btn secondary" href="#workspace">Мой кабинет</a></div></div><aside class="panel">${ratingPanel(task.rating)}</aside></div>`;
  }
  function taskPage(task, offers) {
    const own = state.role === 'business' && task.ownerId === 'business-1';
    const myOffers = offers.filter(o => o.teamId === currentTeam().id);
    app.innerHTML = `<a class="back" href="#catalog">← Все задачи</a><div class="status-line"><span class="tag">${h(task.category)}</span><span class="tag">${h(taskStatus[task.status])}</span></div><h1 class="page-title">${h(task.title)}</h1><p class="muted">${h(task.company)} · ${h(task.deadline || 'Срок обсуждается')}</p><div class="layout"><div class="panel detail-section">${[['problem', 'Контекст и проблема'], ['need', 'Потребность бизнеса'], ['outcome', 'Ожидаемый результат'], ['success', 'Критерии успеха'], ['data', 'Данные и материалы'], ['constraints', 'Условия и ограничения'], ['users', 'Для кого создаётся решение'], ['contact', 'Контакт бизнеса'], ['interactionFormat', 'Формат взаимодействия']].map(([key, label]) => `<h3>${label}</h3><p>${h(task[key] || 'Пока не указано — можно уточнить у бизнеса в предложении.')}</p>`).join('')}${own ? `<div class="actions"><a class="btn" href="#offers/${encodeURIComponent(task.id)}">Сравнить предложения · ${offers.length} →</a></div>` : ''}</div><aside><div class="panel">${ratingPanel(task.rating)}</div><div class="panel project" id="proposal-panel">${state.role !== 'student' ? '<h3 class="subheading">Свежий взгляд на вашу задачу</h3><p class="muted">Любая студенческая команда может предложить решение. Для проверки этого сценария переключите демо-роль на «Команда».</p>' : task.status !== 'published' ? '<h3>Приём предложений завершён</h3><p class="muted">Посмотрите другие открытые задачи в каталоге.</p>' : `<h3 class="subheading">Предложите своё решение</h3><p class="muted">Расскажите о команде и подходе к задаче. Можно отправить несколько вариантов — число откликов не ограничено.</p>${myOffers.length ? `<div class="notice">Ваших предложений: ${myOffers.length}. Их статусы доступны <a class="text-link" href="#workspace">в кабинете</a>. Можно отправить ещё одно.</div>` : ''}<form id="offer-form">${field('team', 'Название команды', currentTeam().name, { required: true, max: 80, hint: 'Команду можно переключить в шапке страницы.' })}${field('members', 'Состав и навыки', '', { required: true, placeholder: '3 участника · Python, дизайн, аналитика' })}${field('approach', 'Ваш подход к задаче', '', { area: true, required: true, placeholder: 'С чего начнёте и какой результат предложите?' })}${field('plan', 'План работы по этапам', '', { area: true, required: true, placeholder: 'Например: интервью → прототип → тестирование → демонстрация' })}${field('prototypeUrl', 'Ссылка на прототип (необязательно)', '', { type: 'url', placeholder: 'https://…' })}${field('duration', 'Предлагаемый срок', '', { required: true, placeholder: '4 недели' })}${field('contact', 'Контактный email', '', { required: true, type: 'email' })}<button class="btn wide" type="submit">Отправить предложение ↗</button></form>`}</div></aside></div>`;
    const teamField = document.querySelector('#offer-form [name="team"]');
    if (teamField) teamField.readOnly = true;
    document.querySelector('#offer-form')?.addEventListener('submit', event => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
      action(event.submitter, async () => { if (['team', 'members', 'approach', 'plan', 'duration', 'contact'].some(key => !String(data[key] || '').trim())) throw new Error('Заполните все поля предложения.'); if (data.prototypeUrl && !url(data.prototypeUrl)) throw new Error('Ссылка на прототип должна начинаться с http:// или https://.'); await api.submitOffer(task.id, data); toast('Предложение отправлено бизнесу'); render(); });
    });
  }
  function offersPage(task, offers) {
    if (state.role !== 'business' || task.ownerId !== 'business-1') { app.innerHTML = empty('Предложения доступны владельцу задачи', 'Переключитесь в кабинет бизнеса для своей задачи.', '<a class="btn secondary" href="#workspace">Открыть кабинет</a>'); return; }
    const chosen = offers.filter(o => o.status === 'selected');
    const teamCount = new Set(chosen.map(o => o.teamId)).size;
    const decisionLabels = { pending: 'На рассмотрении', selected: 'Выбрано бизнесом', declined: 'Отклонено' };
    app.innerHTML = `<a class="back" href="#workspace">← Мой кабинет</a>
      <div class="compare-heading"><div><div class="eyebrow muted">Выбор команды · ${offers.length} предложений</div><h1 class="page-title">Разные подходы.<br>Ваше решение.</h1><p class="muted">${h(task.title)}</p></div><div class="compare-note"><span>↔</span><p>Сравните идеи, планы и сроки.<br><strong>Каждое решение принимает бизнес.</strong></p></div></div>
      <div class="notice">Выберите или отклоните каждый вариант вручную. Одна команда может отправить несколько предложений. Выбор варианта сохраняется; для старта проекта подтвердите сотрудничество ниже.</div>
      ${offers.length ? `<div class="comparison-grid">${offers.map((o, index) => `<article class="comparison-card ${o.status === 'selected' ? 'is-selected' : o.status === 'declined' ? 'is-declined' : ''}">
        <div class="comparison-card-header"><div class="team-avatar">${h(o.team.slice(0, 2))}</div><div><span class="eyebrow muted">Предложение ${index + 1}</span><h2>${h(o.team)}</h2></div><span class="selection-mark" aria-hidden="true">✓</span></div>
        <span class="tag proposal-status">${h(decisionLabels[o.status])}</span>
        <dl class="compare-details"><div><dt>Состав и навыки</dt><dd>${h(o.members)}</dd></div><div class="approach-cell"><dt>Идея решения</dt><dd>${h(o.approach)}</dd></div><div><dt>План работы</dt><dd>${h(o.plan || 'Команда уточнит план перед стартом')}${url(o.prototypeUrl) ? `<p><a class="text-link" href="${url(o.prototypeUrl)}" target="_blank" rel="noopener noreferrer">Посмотреть прототип ↗</a></p>` : ''}</dd></div><div><dt>Предлагаемый срок</dt><dd class="duration-value">${h(o.duration)}</dd></div><div><dt>Контакт команды</dt><dd>${h(o.contact)}</dd></div></dl>
        ${task.selectionDone ? `<div class="decision-badge">${o.status === 'selected' ? '✓ Сотрудничество подтверждено' : 'Предложение отклонено'}</div>` : `<div class="proposal-actions"><button class="btn small" data-offer="${h(o.id)}" data-decision="selected" ${o.status === 'selected' ? 'disabled' : ''}>Выбрать</button><button class="btn secondary small" data-offer="${h(o.id)}" data-decision="declined" ${o.status === 'declined' ? 'disabled' : ''}>Отклонить</button></div>`}
      </article>`).join('')}</div>` : empty('Предложений пока нет', 'Опубликованная задача доступна всем командам.')}
      ${task.selectionDone ? `<div class="selection-bar"><div><strong>${task.selectedTeamIds.length ? 'Выбор подтверждён' : 'Подбор завершён'}</strong><p class="muted">${task.selectedTeamIds.length ? `Выбрано команд: ${task.selectedTeamIds.length}. Можно переходить к этапам проекта.` : 'Вы решили не выбирать команду для этой задачи.'}</p></div><a class="btn" href="#workspace/progress">Перейти в кабинет →</a></div>` : `<div class="selection-bar"><div class="selection-summary"><strong>Выбрано предложений: ${chosen.length} · команд: ${teamCount}</strong><p class="muted">${chosen.length ? h([...new Set(chosen.map(o => o.team))].join(' · ')) : 'Нажмите «Выбрать» у подходящего предложения'}</p></div><div class="selection-actions"><button class="btn secondary" id="select-none">Завершить без выбора</button><button class="btn" id="select-teams" ${chosen.length ? '' : 'disabled'}>Подтвердить сотрудничество →</button></div></div>`}`;
    let deciding = false;
    document.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', event => {
      if (deciding) return;
      deciding = true;
      action(event.currentTarget, async () => {
        try { await api.decideOffer(button.dataset.offer, button.dataset.decision); toast(button.dataset.decision === 'selected' ? 'Предложение выбрано' : 'Предложение отклонено'); await render(); }
        finally { deciding = false; }
      });
    }));
    document.querySelector('#select-teams')?.addEventListener('click', event => action(event.currentTarget, async () => {
      if (deciding) return;
      const names = [...new Set(chosen.map(o => o.team))].join(', ');
      if (await confirmAction('Подтвердить сотрудничество?', `Команды: ${names}. Выбрано вариантов: ${chosen.length}. Остальные предложения будут отклонены, приём новых откликов завершится.`)) {
        await api.selectOffers(task.id, chosen.map(o => o.id)); toast('Сотрудничество подтверждено'); go('workspace/progress');
      }
    }));
    document.querySelector('#select-none')?.addEventListener('click', event => action(event.currentTarget, async () => {
      if (deciding) return;
      if (await confirmAction('Завершить без выбора?', 'Все предложения будут отклонены. Задача останется в каталоге с закрытым приёмом предложений.')) {
        await api.selectOffers(task.id, []); toast('Подбор завершён без выбора'); render();
      }
    }));
  }
  function stageCard(stage, task) {
    const canSubmit = state.role === 'student' && ['in_progress', 'revision'].includes(stage.status);
    const resultUrl = url(stage.url);
    return `<article class="stage"><div class="card-top"><div><h4>${h(stage.title)}</h4><p class="muted">${h(task?.title || '')} · ${h(stage.team)}</p></div><span class="tag">${h(stageStatus[stage.status])}</span></div>${stage.result ? `<p>${h(stage.result)}</p>${resultUrl ? `<a class="text-link muted" href="${resultUrl}" target="_blank" rel="noopener noreferrer">Открыть результат ↗</a>` : ''}` : ''}${stage.feedback ? `<div class="notice">Комментарий бизнеса: ${h(stage.feedback)}</div>` : ''}${stage.status === 'approved' ? `<div class="notice">✓ Этап подтверждён бизнесом. Начислено <strong>+${stage.points} баллов</strong>.</div>` : `<p class="muted">${stage.points} баллов после подтверждения бизнесом</p>`}${canSubmit ? `<form class="stage-form" data-stage="${h(stage.id)}">${field('result', 'Что сделано на этапе?', stage.result, { area: true, required: true, placeholder: 'Опишите результат и как его проверить' })}${field('url', 'Ссылка на результат', stage.url, { type: 'url', required: true, placeholder: 'https://…' })}<button class="btn small" type="submit">Отправить на проверку →</button></form>` : state.role === 'business' && stage.status === 'pending' ? `<form class="review-form" data-stage="${h(stage.id)}">${field('feedback', 'Комментарий команде', '', { area: true, placeholder: 'Обязателен при возврате на доработку' })}<div class="actions"><button class="btn small" type="submit" value="approve">Подтвердить · +${stage.points} баллов</button><button class="btn secondary small" type="submit" value="revision">На доработку</button></div></form>` : ''}</article>`;
  }
  function workspace(data, tab) {
    const business = state.role === 'business';
    const entries = business ? data.tasks : data.offers.map(proposal => ({ ...data.tasks.find(t => t.id === proposal.taskId), proposal }));
    const points = data.stages.filter(s => s.status === 'approved').reduce((sum, s) => sum + s.points, 0);
    app.innerHTML = `<div class="section-head"><div><div class="eyebrow muted">${business ? 'Кабинет бизнеса' : 'Кабинет команды'}</div><h1 class="page-title" style="margin-top:12px">${business ? 'От задачи — к сотрудничеству' : `Привет, ${h(currentTeam().name)}. Время создавать.`}</h1><p class="muted">${business ? 'Управляйте задачами, сравнивайте предложения и подтверждайте результаты.' : 'Ваши предложения, проекты и баллы за реальные результаты.'}</p></div>${business ? '<a class="btn" href="#create/1">+ Новая задача</a>' : '<a class="btn" href="#catalog">Найти задачу ↗</a>'}</div><div class="stats"><div class="stat"><strong>${business ? data.tasks.length : data.offers.length}</strong><span>${business ? 'ваших задач' : 'предложений'}</span></div><div class="stat"><strong>${data.stages.length}</strong><span>этапов проектов</span></div><div class="stat"><strong>${points}</strong><span>${business ? 'баллов начислено' : 'баллов за прогресс'}</span></div></div><div class="tabs"><a class="btn secondary ${tab !== 'progress' ? 'active' : ''}" href="#workspace">${business ? 'Мои задачи' : 'Мои предложения'}</a><a class="btn secondary ${tab === 'progress' ? 'active' : ''}" href="#workspace/progress">Прогресс проектов</a></div>${tab === 'progress' ? `<div class="panel"><h2>От результата — к признанию</h2><p class="muted">Команда отправляет результат этапа. Бизнес проверяет его и подтверждает начисление баллов.</p>${data.stages.length ? data.stages.map(s => stageCard(s, data.tasks.find(t => t.id === s.taskId))).join('') : empty('Пока нет активных этапов', business ? 'Выберите команду в предложениях к своей задаче — после этого появится этап проекта.' : 'Этапы появятся, когда бизнес выберет вашу команду.')}</div>` : entries.length ? `<div class="grid">${entries.map(task => `<article class="card"><div class="card-top"><span class="tag">${h(task.category)}</span><span class="ready">${task.rating.total}% готовности</span></div><h3>${h(task.title)}</h3><p>${h(taskStatus[task.status])}</p>${business && task.status === 'draft' ? `<div class="actions"><a class="btn small" href="#edit/${encodeURIComponent(task.id)}">Продолжить черновик →</a></div>` : business ? `<div class="company">Предложений: ${task.offerCount}</div><div class="actions"><a class="btn small" href="#offers/${encodeURIComponent(task.id)}">Сравнить предложения</a><a class="text-link muted" href="#task/${encodeURIComponent(task.id)}">Карточка ↗</a></div>` : `<div class="notice">${h(offerStatus[task.proposal?.status] || '')}</div><p>${h(task.proposal?.approach || '')}</p><a class="btn secondary small" href="#task/${encodeURIComponent(task.id)}">Открыть задачу →</a>`}</article>`).join('')}</div>` : empty(business ? 'Пока нет задач' : 'Вы ещё не отправляли предложения', business ? 'Опишите первую потребность, и система поможет оформить карточку.' : 'Выберите интересную задачу в каталоге и предложите своё решение.')}`;
    document.querySelectorAll('.stage-form').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(form));
      action(event.submitter, async () => { if (!values.result.trim() || !url(values.url)) throw new Error('Добавьте описание и корректную ссылку http:// или https://.'); await api.submitStage(form.dataset.stage, values); toast('Результат отправлен на проверку'); render(); });
    }));
    document.querySelectorAll('.review-form').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault(); const approved = event.submitter.value === 'approve'; const feedback = new FormData(form).get('feedback').trim();
      action(event.submitter, async () => { if (!approved && !feedback) throw new Error('Укажите, что нужно доработать.'); await api.reviewStage(form.dataset.stage, approved, feedback); toast(approved ? 'Этап подтверждён, баллы начислены' : 'Результат возвращён на доработку'); render(); });
    }));
  }
  async function render() {
    if (autosave.dirty()) autosave.flush().catch(() => {});
    document.querySelector('#team-profile').hidden = state.role !== 'student';
    document.querySelector('#team-name').value = currentTeam().name;
    const ticket = ++state.ticket;
    const [page = 'catalog', param] = (location.hash.slice(1) || 'catalog').split('/');
    document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === (page.startsWith('catalog') ? 'catalog' : page === 'workspace' || page === 'offers' ? 'workspace' : '')));
    app.setAttribute('aria-busy', 'true');
    app.innerHTML = '<div class="loading" role="status">Загружаем…</div>';
    try {
      if (page === 'catalog' || page === 'catalog-list') { const tasks = await api.listTasks(); if (ticket === state.ticket) catalog(tasks); }
      else if (page === 'edit' && api.openDraft) {
        if (state.role !== 'business') { app.innerHTML = empty('Черновики доступны бизнесу', 'Переключите демо-роль на «Бизнес».'); }
        else {
          await autosave.flush();
          const draft = await api.openDraft(decodeURIComponent(param || ''));
          if (ticket === state.ticket) { state.draft = draft; state.questions = []; go('create/3'); }
        }
      }
      else if (page === 'create') await createPage(Math.max(1, Math.min(3, Number(param) || 1)), ticket);
      else if (page === 'task' || page === 'offers' || page === 'published') {
        const [task, offers] = await Promise.all([api.getTask(decodeURIComponent(param || '')), api.listOffers(decodeURIComponent(param || ''))]);
        if (ticket === state.ticket) { if (page === 'published') published(task); else if (page === 'offers') offersPage(task, offers); else taskPage(task, offers); }
      } else if (page === 'workspace') { const data = await api.getWorkspace(state.role); if (ticket === state.ticket) workspace(data, param); }
      else app.innerHTML = empty('Страница не найдена', 'Перейдите в каталог, чтобы продолжить.', '<a class="btn" href="#catalog">В каталог</a>');
    } catch (error) {
      if (ticket === state.ticket) { app.innerHTML = `<div class="empty"><h2>Не удалось открыть страницу</h2><p class="muted">${h(error.message)}</p><button id="retry" class="btn">Повторить</button> <a class="btn secondary" href="#catalog">В каталог</a></div>`; document.querySelector('#retry').onclick = render; }
    } finally { if (ticket === state.ticket) app.removeAttribute('aria-busy'); }
  }
  roleSelect.addEventListener('change', () => { state.role = roleSelect.value; toast(state.role === 'business' ? 'Демо-роль: представитель бизнеса' : `Демо-роль: команда ${currentTeam().name}`); render(); });
  document.querySelector('#team-name').addEventListener('change', event => {
    try { window.platformTeam.set(event.target.value); toast(`Активная команда: ${currentTeam().name}`); render(); }
    catch (error) { event.target.value = currentTeam().name; toast(error.message); }
  });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  window.addEventListener('beforeunload', event => {
    if (autosave.dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autosave.dirty()) autosave.flush().catch(() => {});
  });
  render();
})();
