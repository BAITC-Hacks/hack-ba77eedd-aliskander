/* Match presentation, profile editor and accessible details dialog. */
(() => {
  window.createMatchUI = ({ api, app, state, h, field, toast, go }) => {
    const records = new Map(), cache = new Map();
    let profileCache, profileTeam, dialogVersion = 0, pendingApply = '';
    const currentId = () => window.platformTeam.current.id;
    const split = value => String(value || '').split(/[,\n]/).map(v => v.trim()).filter(Boolean);
    const choices = (name, label, values, value) => `<label class="field">${label}<select name="${name}"><option value="">Не указано</option>${values.map(v => `<option ${v === value ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
    const ring = match => `<div class="match-ring" style="--match:${match.matchScore}%" role="progressbar" aria-label="Соответствие задаче" aria-valuenow="${match.matchScore}" aria-valuemin="0" aria-valuemax="100"><strong>${match.matchScore}<small>%</small></strong></div>`;
    const skillChips = match => `<div class="match-skills">${match.matchedSkills.map(s => `<span class="is-matched">✓ ${h(s)}</span>`).join('')}${match.missingSkills.map(s => `<span class="is-missing">⚠ ${h(s)}</span>`).join('')}</div>`;
    function summary(match, key, candidate = '') {
      return `<div class="match-summary">${ring(match)}<div><span class="eyebrow muted">${candidate ? h(candidate) : 'Подходит вам'}</span><strong>${match.matchScore}% Match</strong><span class="match-label">${h(match.label)}</span></div><span class="match-spark" aria-hidden="true">✦</span></div>${skillChips(match)}${match.missingData.length ? '<p class="match-caveat">Предварительно · есть незаполненные сведения</p>' : ''}<button type="button" class="match-details-button" data-match-details="${h(key)}">View Match Details <span>↗</span></button>`;
    }
    async function profile() {
      const id = currentId();
      if (!profileCache || profileTeam !== id) { profileTeam = id; profileCache = api.getProfile().catch(error => { if (profileTeam === id) profileCache = null; throw error; }); }
      return profileCache;
    }
    const slot = task => `<section class="match-box" data-match-task="${h(task.id)}" aria-label="Соответствие задаче"><div class="match-skeleton" role="status"><span></span><div><i></i><i></i></div><span class="visually-hidden">Рассчитываем Match…</span></div></section>`;
    async function attach(tasks) {
      const ticket = state.ticket, team = currentId();
      const nodes = [...document.querySelectorAll('[data-match-task]')];
      if (!nodes.length) return;
      const valid = node => ticket === state.ticket && team === currentId() && node.isConnected;
      try {
        const student = await profile();
        await Promise.all(nodes.map(async node => {
          const task = tasks.find(t => t.id === node.dataset.matchTask);
          if (!task) return;
          try {
            const cacheKey = JSON.stringify([student, task.id, task.requiredSkills, task.category, task.difficulty, task.requiredHours]);
            if (cache.size > 200) cache.clear();
            if (!cache.has(cacheKey)) cache.set(cacheKey, api.matchTask(student, task).catch(error => { cache.delete(cacheKey); throw error; }));
            const match = await cache.get(cacheKey);
            if (!valid(node)) return;
            const key = 'task:' + task.id;
            records.set(key, { match, student, task });
            node.innerHTML = summary(match, key) + `<div class="match-card-actions"><a href="#profile">Настроить профиль</a>${task.status === 'published' ? `<button type="button" class="btn small" data-match-apply="${h(task.id)}">Apply →</button>` : '<span class="muted">Приём завершён</span>'}</div>`;
          } catch (error) { if (valid(node)) failure(node, error, tasks); }
        }));
      } catch (error) { nodes.forEach(node => { if (valid(node)) failure(node, error, tasks); }); }
      if (pendingApply && tasks.some(t => t.id === pendingApply) && document.querySelector('#offer-form')) { pendingApply = ''; focusOffer(); }
    }
    function failure(node, error, tasks) {
      node.innerHTML = `<p class="muted">${h(error.message)}</p><button type="button" class="btn secondary small">Повторить расчёт</button>`;
      node.querySelector('button').onclick = () => attach(tasks);
    }
    function offer(match, student, task, id) {
      if (!match || !student) return '<div class="match-box match-empty">' + (student ? 'Match недоступен: уточните навыки, сложность и нагрузку задачи.' : 'Профиль участника не приложен к этому отклику.') + '</div>';
      const key = 'offer:' + id;
      records.set(key, { match, student, task: match.task || task, snapshot: true });
      return `<section class="match-box">${summary(match, key, student.name || 'Участник команды')}<p class="match-caveat">Профиль представителя команды на момент отклика</p></section>`;
    }
    function focusOffer() { const form = document.querySelector('#offer-form'); if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.querySelector('input:not([readonly]), textarea')?.focus({ preventScroll: true }); } }
    app.addEventListener('click', event => {
      const details = event.target.closest('[data-match-details]');
      if (details) { event.preventDefault(); showDetails(details.dataset.matchDetails); }
      const apply = event.target.closest('[data-match-apply]');
      if (apply) { event.preventDefault(); pendingApply = apply.dataset.matchApply; if (location.hash === '#task/' + encodeURIComponent(pendingApply)) { pendingApply = ''; focusOffer(); } else go('task/' + encodeURIComponent(pendingApply)); }
    });
    function showDetails(key) {
      const record = records.get(key); if (!record) return;
      const { match, student, task } = record;
      const dialog = document.querySelector('#match-dialog'), version = ++dialogVersion;
      const labels = { skills: 'Skills Match', experience: 'Experience Match', interest: 'Interest Match', difficulty: 'Difficulty Match', availability: 'Availability Match' };
      dialog.innerHTML = `<div class="match-dialog-head"><div><span class="eyebrow muted">AI Match · ${h(student.name || 'Ваш профиль')}</span><h2 id="match-dialog-title">Why this task matches you</h2><p class="muted">${h(task.title || 'Задача')}</p></div><button class="dialog-close" type="button" aria-label="Закрыть подробности">×</button></div><div class="match-dialog-score">${ring(match)}<div><h3>${match.matchScore}% Match</h3><span>${h(match.label)}</span><p class="muted">${record.snapshot ? 'Снимок на момент отправки предложения' : 'Расчёт по сведениям профиля'}</p></div></div><div class="match-breakdown">${Object.entries(labels).map(([k,label]) => `<div><div><strong>${label}</strong><span>${match.breakdown[k]}% <small>× ${match.weights[k]}% веса</small></span></div><div class="bar"><span style="width:${match.breakdown[k]}%"></span></div><small>Вклад: ${match.contributions[k]} из ${match.weights[k]} баллов</small></div>`).join('')}</div><p class="match-caveat">Итог — взвешенная сумма пяти критериев, округлённая до целого. Неизвестные сведения не дают баллов. Match не является решением о выборе команды.</p><div class="match-detail-columns"><section><h3>Strengths</h3><ul class="match-reasons">${match.strengths.map(s => `<li>✓ ${h(s)}</li>`).join('') || '<li>Пока недостаточно сведений</li>'}</ul></section><section><h3>Missing skills</h3>${skillChips({ matchedSkills: [], missingSkills: match.missingSkills })}${!match.missingSkills.length ? `<p class="muted">${match.task?.requiredSkills?.length ? 'Нет пропусков среди указанных навыков' : 'Навыки задачи не указаны'}</p>` : ''}</section></div><section class="match-recommendations"><h3>How to improve your match</h3><ul>${match.recommendations.map(s => `<li>${h(s)}</li>`).join('') || '<li>Поддерживайте профиль и примеры работ в актуальном состоянии.</li>'}</ul></section><div class="match-explanation"><span class="eyebrow muted" id="match-explanation-source">Объяснение по критериям</span><p id="match-explanation-text">${h(match.explanation)}</p>${api.meta.mode === 'live' ? '<button class="btn secondary small" id="explain-match" type="button">✦ Объяснить с OpenAI</button>' : '<small>Демо использует тот же алгоритм без OpenAI.</small>'}<p class="muted" id="match-explanation-notice"></p></div><p class="match-caveat">Навыки, GitHub-технологии и личные проекты указаны участником. Ссылки автоматически не проверяются. Подтверждённые этапы платформы также учитываются в опыте.</p>`;
      dialog.querySelector('.dialog-close').onclick = () => { dialogVersion++; dialog.close(); };
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('#explain-match')?.addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; button.textContent = 'Готовим объяснение…';
        try {
          const result = await api.matchTask(student, task, true);
          if (version !== dialogVersion || !dialog.open) return;
          dialog.querySelector('#match-explanation-text').textContent = result.explanation;
          dialog.querySelector('#match-explanation-source').textContent = result.explanationSource === 'OpenAI' ? 'AI-пояснение · OpenAI' : 'Объяснение по критериям';
          dialog.querySelector('#match-explanation-notice').textContent = result.explanationNotice || '';
        } catch (error) { if (version === dialogVersion && dialog.open) dialog.querySelector('#match-explanation-notice').textContent = error.message; }
        finally { if (button.isConnected) { button.disabled = false; button.textContent = '✦ Объяснить с OpenAI'; } }
      });
    }
    async function renderProfile(ticket) {
      if (state.role !== 'student') { app.innerHTML = '<div class="empty"><h2>Профиль участника</h2><p>Переключите роль на «Студенческая команда» в шапке.</p></div>'; return; }
      let value = await profile();
      if (ticket !== state.ticket) return;
      value = JSON.parse(JSON.stringify(value));
      let projects = value.projects || [];
      const read = () => {
        const data = new FormData(document.querySelector('#match-profile-form'));
        const result = Object.fromEntries(data);
        return { name: result.name, skills: split(result.skills), experience: String(result.experience || '').split('\n').filter(Boolean), interests: split(result.interests),
          level: result.level, preferredDifficulty: result.preferredDifficulty, availabilityHours: result.availabilityHours,
          githubUrl: result.githubUrl, portfolioUrl: result.portfolioUrl, githubTechnologies: split(result.githubTechnologies),
          projects: projects.map((_, i) => ({ title: result['project-title-' + i], skills: split(result['project-skills-' + i]), category: result['project-category-' + i], completed: data.has('project-completed-' + i), url: result['project-url-' + i] })) };
      };
      function draw() {
        app.innerHTML = `<a class="back" href="#catalog">← Каталог задач</a><div class="section-head"><div><span class="eyebrow muted">Ваш следующий проект начинается здесь</span><h1 class="page-title">Профиль участника</h1><p class="muted">Команда ${h(window.platformTeam.current.name)} · Match рассчитывается для этого представителя команды.</p></div><a class="btn secondary" href="demo.html#match-demo">Посмотреть демо 87% ↗</a></div><div class="layout"><section class="panel profile-editor"><form id="match-profile-form"><div class="editor-toolbar"><span class="editor-label">Расскажите о своём опыте</span><span class="save-status" id="profile-save-status" role="status">Профиль загружен</span></div>${field('name', 'Ваше имя', value.name, { max: 100 })}${field('skills', 'Навыки', (value.skills || []).join(', '), { area: true, hint: 'Например: React, TypeScript, PostgreSQL, REST API. Учитываем регистр и распространённые названия.' })}<div class="two">${choices('level', 'Уровень опыта', ['Beginner','Intermediate','Advanced'], value.level)}${choices('preferredDifficulty', 'Желаемая сложность', ['Easy','Medium','Hard'], value.preferredDifficulty)}</div><div class="two">${field('availabilityHours', 'Доступно часов в неделю', value.availabilityHours ?? '', { type: 'number' })}${field('interests', 'Интересы', (value.interests || []).join(', '), { hint: 'Frontend, Backend, AI, Mobile, Design, Data' })}</div>${field('experience', 'Опыт работы с технологиями', (value.experience || []).join('\n'), { area: true, hint: 'По одному примеру на строку. Например: создавал REST API для сервиса записи.' })}<details class="review-details" open><summary>GitHub и портфолио</summary>${field('githubUrl', 'Ссылка на GitHub', value.githubUrl, { type: 'url', max: 1000 })}${field('portfolioUrl', 'Ссылка на портфолио', value.portfolioUrl, { type: 'url', max: 1000 })}${field('githubTechnologies', 'Технологии в ваших репозиториях', (value.githubTechnologies || []).join(', '), { area: true, hint: 'Указываются вручную. Одна ссылка без сведений о технологиях не увеличивает Match.' })}</details><div class="section-head"><h3>Завершённые и текущие проекты</h3><button class="btn secondary small" id="add-profile-project" type="button">+ Проект</button></div><div class="profile-projects">${projects.map((p,i) => `<section class="profile-project"><div class="editor-toolbar"><strong>Проект ${i+1}</strong><button type="button" class="text-link" data-remove-project="${i}">Удалить</button></div>${field('project-title-'+i, 'Название', p.title, { max: 200 })}${field('project-skills-'+i, 'Технологии', (p.skills || []).join(', '), { area: true })}<div class="two">${field('project-category-'+i, 'Направление', p.category, { hint: 'Например: Fullstack' })}${field('project-url-'+i, 'Ссылка', p.url, { type: 'url', max: 1000 })}</div><label class="check-label"><input name="project-completed-${i}" type="checkbox" ${p.completed ? 'checked' : ''}>Проект завершён</label></section>`).join('') || '<p class="muted">Добавьте первый проект: он поможет объяснить ваш опыт.</p>'}</div><p class="muted">Подтверждённых бизнесом этапов: ${(value.completedTasks || []).length}. Они учитываются автоматически и не редактируются здесь.</p><div class="actions"><button class="btn" type="submit">Сохранить профиль →</button><button class="btn secondary" id="fill-match-demo" type="button">Заполнить пример Ali</button></div><p id="profile-error" class="error" role="alert"></p></form></section><aside class="profile-aside panel"><div class="profile-mark">✦</div><span class="eyebrow muted">Понятное соответствие</span><h2>Ваш опыт.<br>Подходящие задачи.</h2><p class="muted">Match помогает оценить задачу перед откликом. Чем полнее профиль, тем полезнее объяснение.</p><div class="profile-weights"><div>Навыки <strong>50%</strong></div><div>Опыт и проекты <strong>20%</strong></div><div>Интересы <strong>10%</strong></div><div>Сложность <strong>10%</strong></div><div>Время <strong>10%</strong></div></div><p class="hint">После сохранения профиль будет приложен к новым откликам. Решение о сотрудничестве принимает бизнес.</p></aside></div>`;
        const form = document.querySelector('#match-profile-form');
        const hours = form.elements.namedItem('availabilityHours'); hours.min = '0'; hours.max = '168'; hours.step = '0.5';
        form.oninput = () => { document.querySelector('#profile-save-status').textContent = 'Есть несохранённые изменения'; };
        form.onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; if (button?.disabled) return;
          if (button) button.disabled = true;
          const identity = currentId();
          try {
            const saved = await api.saveProfile(window.MostMatch.profile(read()));
            if (ticket !== state.ticket || identity !== currentId()) return;
            profileTeam = identity; profileCache = Promise.resolve(saved); cache.clear();
            document.querySelector('#profile-save-status').textContent = '✓ Профиль сохранён';
            document.querySelector('#profile-error').textContent = ''; toast('Профиль сохранён. Match пересчитается при открытии задач.');
          } catch (error) { if (ticket === state.ticket) document.querySelector('#profile-error').textContent = error.message; }
          finally { if (button?.isConnected) button.disabled = false; }
        };
        document.querySelector('#add-profile-project').onclick = () => {
          value = { ...value, ...read() }; projects = value.projects;
          if (projects.length >= 30) { toast('Максимум 30 проектов'); return; }
          projects.push({ title: '', skills: [], category: '', url: '', completed: false }); draw(); document.querySelector('#profile-save-status').textContent = 'Есть несохранённые изменения';
        };
        document.querySelectorAll('[data-remove-project]').forEach(button => button.onclick = () => { value = { ...value, ...read() }; projects = value.projects; projects.splice(Number(button.dataset.removeProject), 1); draw(); document.querySelector('#profile-save-status').textContent = 'Есть несохранённые изменения'; });
        document.querySelector('#fill-match-demo').onclick = () => { value = JSON.parse(JSON.stringify(window.MostMatchDemo.student)); projects = value.projects; draw(); document.querySelector('#profile-save-status').textContent = 'Пример заполнен — сохраните профиль'; };
      }
      draw();
    }
    async function demo() {
      if (api.meta.mode !== 'demo') { location.href = 'demo.html#match-demo'; return; }
      const saved = await api.saveProfile(window.MostMatchDemo.student);
      profileTeam = currentId(); profileCache = Promise.resolve(saved); cache.clear();
      go('task/' + window.MostMatchDemo.task.id);
      toast('Демонстрационный профиль Ali: 4 из 5 навыков, 2 проекта');
    }
    return { slot, attach, offer, renderProfile, demo };
  };
})();
