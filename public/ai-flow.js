/* Describe -> contextual interview -> generated task -> manual review. */
(() => {
  window.createAIFlow = options => {
    const { api, app, state, autosave, h, go, toast, field, categoryField, ratingPanel, draftPreview, confirmAction, updateSaveStatus } = options;
    const ui = window.MostAIComponents;
    let config = null;
    let working = false;
    let errorMessage = '';
    let retry = null;
    let ratingVersion = 0;
    let ratingTimer;
    const blank = () => ({ title: '', company: '', category: 'Веб-разработка', problem: '', need: '', users: '', outcome: '', success: '', data: '', constraints: '', contact: '', interactionFormat: '', deadline: '', requirements: '', requiredSkills: '', difficulty: '', recommendedTeamSize: '' });
    const known = draft => Object.fromEntries(['need', 'users', 'requirements', 'success', 'outcome', 'data', 'constraints', 'contact', 'interactionFormat', 'deadline'].map(key => [key, draft[key] || '']));
    async function render(step, ticket) {
      if (state.role !== 'business') { app.innerHTML = '<div class="empty"><h2>Создание задач доступно бизнесу</h2><p class="muted">Переключите роль в шапке страницы.</p></div>'; return; }
      if (!state.draft) state.draft = await api.getDraft() || blank();
      if (!config) config = api.meta.mode === 'demo' ? { configured: false } : await api.getAIStatus().catch(() => ({ configured: false }));
      if (ticket !== state.ticket) return;
      const draft = state.draft;
      const session = ui.session(draft);
      if (api.meta.mode === 'demo' || !config.configured) session.demo = true;
      if(step===3 && session.answers.length<3 && !session.generated){go('create/1');return;}
      if (step === 2 && !session.questions.length) { go(session.generated ? 'create/3' : 'create/1'); return; }
      const save = () => { draft.aiSession = JSON.stringify(session); autosave.update(draft); };
      const modeBadge = session.demo ? '<span class="ai-mode demo">Демо без OpenAI</span>' : '<span class="ai-mode">✦ Помощник OpenAI</span>';
      const header = `<a class="back" href="#catalog">← В каталог</a><div class="ai-title-row"><div><span class="ai-kicker">✦ Конструктор задачи</span><h1 class="page-title">${step === 1 ? 'Новая задача' : step === 2 ? 'Уточним вашу задачу' : 'Проверьте карточку задачи'}</h1><p class="muted">${step === 1 ? 'Расскажите о проблеме. Остальные детали мы уточним вместе.' : step === 2 ? 'Несколько коротких ответов — и у команды будет понятная задача.' : 'Проверьте и отредактируйте карточку. Публикация — только по вашему решению.'}</p></div>${modeBadge}</div>${ui.progress(step === 3 ? 4 : step)}`;
      const error = `<div id="ai-error" class="ai-error" role="alert" ${errorMessage ? '' : 'hidden'}><strong>Не получилось завершить запрос</strong><p>${h(errorMessage)}</p><button class="btn secondary small" type="button" id="ai-retry">Повторить попытку</button></div>`;
      const saving = '<span id="draft-save-status" class="save-status" role="status" aria-live="polite"></span>';
      const waiting = '<div id="ai-wait" class="ai-wait" hidden></div>';
      if (step === 1) {
        app.innerHTML = header + `<div class="ai-describe-layout"><section class="panel ai-panel"><form id="idea-form"><div class="editor-toolbar"><span class="editor-label">01 / Начнём с вашей идеи</span>${saving}</div><label class="field ai-description-label">Опишите проблему бизнеса<textarea id="idea" name="description" rows="7" maxlength="3000" minlength="20" required placeholder="Например: Нам нужен Telegram-бот для автоматизации записи клиентов в барбершоп…">${h(session.description)}</textarea></label><div class="ai-input-meta"><span>Пишите обычным языком — техническое задание не нужно</span><span id="idea-count">${session.description.length} / 3000</span></div><div class="idea-examples"><span>Попробуйте идею</span><button type="button" data-example="${h(window.MostDefenseCase?.description||'')}">Учебный кейс: студия ↗</button><button type="button" data-example="Нам нужен Telegram-бот для записи клиентов в барбершоп">Бот для записи ↗</button><button type="button" data-example="У нас небольшой магазин. Хотим сайт, чтобы получать заказы от покупателей">Сайт для магазина ↗</button></div><label class="check-label ai-demo-toggle"><input id="ai-demo" type="checkbox" ${session.demo ? 'checked' : ''} ${api.meta.mode === 'demo' ? 'disabled' : ''}>Демонстрационное уточнение без AI</label>${!config.configured && !session.demo ? '<div class="notice">OpenAI пока не настроен на сервере. Можно пройти демонстрационное уточнение без AI.</div>' : ''}<div class="actions"><button type="submit" class="btn ai-btn" id="analyze" ${session.description.trim().length < 20 ? 'disabled' : ''}>✨ Уточнить задачу <span>→</span></button><button type="button" class="btn secondary" id="save-ai-draft">Сохранить черновик</button></div></form>${error}${waiting}</section><aside class="ai-onboarding"><div class="ai-illustration" aria-hidden="true"><div class="idea-node">Ваша идея</div><div class="idea-connector">✦</div><div class="result-node"><span>ГОТОВАЯ ЗАДАЧА</span><i></i><i></i><i></i><div>Цель · Требования · Результат</div></div></div><h2>От мысли —<br>к понятному проекту.</h2><p class="muted">Уточним недостающие детали, соберём требования и предложим структуру карточки.</p><ul class="ai-promises"><li>✓ Учитываем то, что вы уже рассказали</li><li>✓ Отделяем факты от предположений</li><li>✓ Все формулировки можно изменить</li></ul></aside></div>`;
        const input = document.querySelector('#idea');
        const changeIdea = () => {
          const changed = session.description !== input.value;
          session.description = input.value; draft.problem = input.value;
          if (changed) { session.answers = []; session.questions = []; session.generated = false; session.sourceChanged = true; session.compose = ''; }
          document.querySelector('#idea-count').textContent = `${input.value.length} / 3000`;
          document.querySelector('#analyze').disabled = input.value.trim().length < 20;
          save();
        };
        input.addEventListener('input', changeIdea);
        document.querySelectorAll('[data-example]').forEach(button => button.onclick = () => { input.value = button.dataset.example; changeIdea(); input.focus(); });
        document.querySelector('#ai-demo').onchange = event => { session.demo = event.target.checked; save(); errorMessage = ''; render(step, ticket); };
        document.querySelector('#idea-form').onsubmit = event => { event.preventDefault(); changeIdea(); runAI('analyze'); };
      } else if (step === 2) {
        const q = session.questions[0];
        const messages = session.answers.map(answer => `<div class="chat-message assistant"><span class="chat-avatar">✦</span><div><span class="chat-author">Task assistant</span><p>${h(answer.question)}</p></div></div><div class="chat-message user"><div><span class="chat-author">Вы</span><p>${h(answer.answer)}</p></div><span class="chat-avatar">Вы</span></div>`).join('');
        app.innerHTML = header + `<div class="ai-interview-layout"><section class="panel ai-panel chat-panel"><div class="chat-header"><div><span class="ai-kicker">Step 2 of 4 — Clarifying requirements</span><h2>AI Interview</h2></div>${saving}</div><div class="chat-history"><div class="chat-message user"><div><span class="chat-author">Ваша идея</span><p>${h(session.description)}</p></div><span class="chat-avatar">Вы</span></div>${messages}<div class="chat-message assistant current-question"><span class="chat-avatar">✦</span><div><span class="chat-author">Вопрос ${session.answers.length + 1} из ${Math.min(5, session.answers.length + session.questions.length)}</span><p>${h(q.label)}</p><div class="answer-chips">${q.chips.map(chip => `<button type="button" data-chip="${h(chip)}">${h(chip)}</button>`).join('')}</div></div></div></div><form id="answer-form" class="chat-composer"><label class="visually-hidden" for="ai-answer">Ваш ответ</label><textarea id="ai-answer" maxlength="1500" rows="3" required placeholder="Выберите подсказку или напишите свой ответ…">${h(session.compose)}</textarea><div><span class="muted">Можно написать «Пока не знаю» — мы отметим это в карточке.</span><button class="btn ai-btn" type="submit">Ответить →</button></div></form><div class="actions"><button class="btn secondary small" type="button" id="back-to-idea">← К описанию</button><button class="btn secondary small" type="button" id="save-ai-draft">Сохранить черновик</button></div>${error}${waiting}</section><aside class="panel interview-context"><span class="eyebrow muted">Контекст проекта</span><h3>Собираем ясную картину</h3><p class="muted">${h(session.summary)}</p><div class="interview-meter"><strong>${session.answers.length}</strong><span>ответов получено</span></div><div class="bar"><span style="width:${Math.min(100, session.answers.length / 5 * 100)}%"></span></div><p class="muted">Следующие вопросы учитывают весь разговор. Когда информации достаточно, появится карточка.</p><div class="hint">Ничего не публикуется автоматически. Вы сначала увидите и проверите результат.</div></aside></div>`;
        const history = document.querySelector('.chat-history'); history.scrollTop = history.scrollHeight;
        const answer = document.querySelector('#ai-answer');
        answer.oninput = () => { session.compose = answer.value; save(); };
        document.querySelectorAll('[data-chip]').forEach(button => button.onclick = () => { answer.value = button.dataset.chip; session.compose = answer.value; save(); answer.focus(); });
        document.querySelector('#answer-form').onsubmit = event => { event.preventDefault(); session.compose = answer.value; save(); runAI('answer'); };
        document.querySelector('#back-to-idea').onclick = () => go('create/1');
      } else {
        app.innerHTML = header + `<div class="generated-banner"><span>✦</span><div><strong>${session.generated ? 'Черновик готов' : 'Проверка карточки'}</strong><p>${h(session.summary || 'Каждое поле доступно для редактирования. Проверьте факты и ожидаемый результат.')}</p></div><span class="tag">Не опубликовано</span></div><div class="layout"><section class="panel ai-panel"><form id="ai-review-form"><div class="editor-toolbar"><span class="editor-label">Редактируемая карточка</span>${saving}</div>${window.MostReviewEditor(draft,{field,categoryField,h})}<label class="check-label publish-check"><input name="confirmed" type="checkbox" required>Я проверил(а) факты, требования и предположения. Подтверждаю публикацию задачи в общем каталоге.</label><div class="actions"><button class="btn" type="submit">Подтвердить и опубликовать ↗</button><button class="btn secondary" type="button" id="save-ai-draft">Сохранить черновик</button><button class="btn secondary" type="button" id="back-to-idea">← К идее</button></div></form>${error}${waiting}</section><aside class="editor-sidebar"><div class="panel preview-panel" id="draft-preview">${draftPreview(draft, null)}</div><div class="panel" id="ai-notes">${ui.notes(draft, h)}</div><div class="panel" id="rating-panel"><div class="loading">Обновляем рейтинг…</div></div></aside></div>`;
        const form = document.querySelector('#ai-review-form');
        const hours = form.elements.namedItem('requiredHours'); hours.min = '1'; hours.max = '168'; hours.step = '0.5';
        const size = form.elements.namedItem('recommendedTeamSize'); size.min = '1'; size.max = '20'; size.step = '1';
        const capture = () => {
          const data=new FormData(form);
          for(const [key,value] of data)if(key!=='confirmed'&&!key.startsWith('milestone-'))draft[key]=String(value);
          const size=Number(draft.recommendedTeamSize);draft.teamSize=size===1?'1':size>=2&&size<=3?'2-3':size>=4&&size<=5?'4-5':size>5?'5+':'';
          draft.durationWeeks=String(window.MostCatalog.durationWeeks({deadline:draft.deadline})||'');
          draft.stagePlan=JSON.stringify(Array.from({length:Number(data.get('milestone-count'))},(_,i)=>({title:String(data.get('milestone-title-'+i)||''),criteria:String(data.get('milestone-criteria-'+i)||''),points:Number(data.get('milestone-points-'+i))})));
        };
        const updateRating = async () => {
          const version = ++ratingVersion;
          try { const rating = await api.rateTask({ ...draft }); if (ticket === state.ticket && version === ratingVersion) { document.querySelector('#rating-panel').innerHTML = ratingPanel(rating, true); document.querySelector('#draft-preview').innerHTML = draftPreview(draft, rating); } }
          catch (error) { if (ticket === state.ticket) document.querySelector('#rating-panel').innerHTML = `<p class="error">${h(error.message)}</p>`; }
        };
        form.oninput = event => {
          if (event.target.name === 'confirmed') return;
          capture(); form.elements.namedItem('confirmed').checked = false; save(); ratingVersion += 1;
          document.querySelector('#skill-preview').innerHTML = ui.skillTags(draft, h);
          document.querySelector('#ai-notes').innerHTML = ui.notes(draft, h);
          document.querySelector('#draft-preview').innerHTML = draftPreview(draft, null);
          clearTimeout(ratingTimer); ratingTimer = setTimeout(updateRating, 300);
        };
        document.querySelector('#rating-panel').onclick = event => {
          const key = event.target.closest('[data-focus-field]')?.dataset.focusField;
          const target = key && form.elements.namedItem(key);
          if (target) { const details = target.closest('details'); if (details) details.open = true; target.focus(); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        };
        document.querySelector('#quality-ai').onclick=async event=>{
          capture();const button=event.currentTarget,snapshot=JSON.stringify(draft);button.disabled=true;
          const host=document.querySelector('#quality-result');host.textContent='Проверяем описание…';
          try{if(!api.reviewQuality)throw new Error('Проверка качества доступна в основной версии с OpenAI.');const review=await api.reviewQuality({...draft});if(!host.isConnected)return;host.innerHTML='<p class="muted">Рекомендации AI по версии текста на момент проверки. Рейтинг не изменён.</p><ul>'+review.suggestions.map(item=>'<li><strong>'+h(item.label)+'</strong>: '+h(item.hint)+'</li>').join('')+'</ul>';if(snapshot!==JSON.stringify(draft))host.insertAdjacentHTML('afterbegin','<p>Текст уже изменён: проверьте актуальность рекомендаций.</p>');}
          catch(error){if(host.isConnected)host.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
        };
        document.querySelector('#improve-ai').onclick = () => { capture(); runAI('improve'); };
        document.querySelector('#regenerate-ai').onclick = async () => { capture(); if (await confirmAction('Перегенерировать карточку?', 'AI предложит новую формулировку на основе вашего описания, ответов и текущих правок. Предыдущую версию можно будет вернуть.')) runAI('regenerate'); };
        document.querySelector('#undo-ai').disabled=!session.previousTask;
        document.querySelector('#undo-ai')?.addEventListener('click', () => { if(!session.previousTask)return; ui.applyTask(draft, session.previousTask); session.previousTask = null; save(); render(3, ticket); toast('Ваша предыдущая версия восстановлена'); });
        document.querySelector('#back-to-idea').onclick = () => go('create/1');
        form.onsubmit = async event => {
          event.preventDefault(); if (working) return; capture();
          if (!draft.title.trim() || !draft.problem.trim() || !form.elements.namedItem('confirmed').checked) return;
          working = true; form.inert = true;
          try { save(); await autosave.flush(); window.MostMilestones.parse(draft.stagePlan,draft); const task = await api.publishTask({ ...draft }); autosave.reset(); state.draft = null; state.questions = []; errorMessage = ''; go(`published/${encodeURIComponent(task.id)}`); }
          catch (error) { toast(error.message); }
          finally { working = false; if (form.isConnected) form.inert = false; }
        };
        updateRating();
      }
      updateSaveStatus(autosave.status);
      document.querySelector('#save-ai-draft').onclick = async event => {
        const button = event.currentTarget; button.disabled = true;
        try { save(); await autosave.flush(); toast('Черновик и ответы сохранены'); } catch (error) { toast(error.message); } finally { if (button.isConnected) button.disabled = false; }
      };
      document.querySelector('#ai-retry').onclick = () => { if (retry) runAI(retry); };
      async function runAI(action) {
        if (working) return;
        if (session.description.trim().length < 20) { toast('Опишите идею подробнее: минимум 20 символов'); return; }
        if (action === 'answer' && !session.compose.trim()) { toast('Напишите ответ или выберите подсказку'); return; }
        working = true; errorMessage = ''; retry = action;
        const answers = action === 'analyze' ? [] : [...session.answers];
        if (action === 'answer') answers.push({ key: session.questions[0].key, question: session.questions[0].label, answer: session.compose.trim() });
        const previous = ui.taskFromDraft(draft);
        const panel = document.querySelector('.ai-panel');
        panel.querySelectorAll('form').forEach(form => { form.inert = true; });
        panel.classList.add('is-thinking');
        const overlay = document.querySelector('#ai-wait'); overlay.hidden = false;
        overlay.innerHTML = ui.loading(action === 'analyze' ? 'Изучаем описание…' : action === 'answer' ? 'Учитываем ваш ответ…' : 'Готовим карточку…', 'Учитываем описание и ответы. Это может занять немного времени.');
        try {
          save(); await autosave.flush();
          const input = { action, description: session.description, answers, knownFields: session.sourceChanged ? {} : known(draft), currentTask: ['improve', 'regenerate'].includes(action) ? previous : null };
          const result = session.demo ? await window.MostAIDemo.turn(input) : await api.aiTurn(input);
          if (ticket !== state.ticket || state.draft !== draft) return;
          session.answers = answers; session.compose = ''; session.questions = result.questions; session.summary = result.summary;
          if (result.status === 'ready') {
            session.previousTask = session.generated ? previous : null;
            ui.applyTask(draft, result.task); session.generated = true; session.sourceChanged = false;
          }
          save();
          try { await autosave.flush(); } catch (error) { toast('Ответ получен, но сохранение не удалось: ' + error.message); }
          errorMessage = ''; retry = null;
          go(result.status === 'ready' ? 'create/3' : 'create/2');
        } catch (error) {
          errorMessage = error.message || 'AI временно недоступен. Ваш текст сохранён.';
          if (ticket === state.ticket) render(step, ticket);
        } finally { working = false; }
      }
    }
    return { render };
  };
})();
