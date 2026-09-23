/* Adapter for the team's existing Node HTTP API. No rating weights are duplicated here. */
(() => {
  'use strict';
  const currentTeam = () => window.platformTeam?.current || { id: 'team-orbit', name: 'Orbit' };
  const draftKey = 'most-server-draft-id';
  let draftId = '';
  try { draftId = localStorage.getItem(draftKey) || ''; } catch (_) { /* Server remains available. */ }
  const remember = id => { draftId = id; try { if (id) localStorage.setItem(draftKey, id); else localStorage.removeItem(draftKey); } catch (_) {} };
  const route = id => encodeURIComponent(id);
  const keys = { context: 'problem', expectedResult: 'outcome', successCriteria: 'success' };
  const toServer = d => ({ title: d.title || '', company: d.company || '', category: d.category || '', deadline: d.deadline || '',
    context: d.problem || '', expectedResult: d.outcome || '', successCriteria: d.success || '', data: d.data || '',
    need: d.need || '', interactionFormat: d.interactionFormat || '', constraints: d.constraints || '', users: d.users || '', contact: d.contact || '' });
  async function request(path, method = 'GET', data) {
    const response = await fetch('/api' + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'Не удалось выполнить запрос'); error.status = response.status; throw error; }
    return result;
  }
  const rating = raw => ({ total: raw.score, level: raw.level, missingDetails: raw.missingDetails || [],
    source: raw.source || raw.ratingSource || 'local', warning: raw.warning || raw.ratingWarning || '',
    breakdown: (raw.breakdown || []).map(c => ({ ...c, key: keys[c.key] || c.key })),
    hints: (raw.breakdown || []).filter(c => c.points < c.max).map(c => c.hint)
  });
  const task = (raw, offerCount = 0) => ({ id: raw.id, title: raw.title || 'Без названия', company: raw.company || 'Бизнес',
    category: raw.category || 'Исследования', deadline: raw.deadline || '', problem: raw.context || '',
    outcome: raw.expectedResult || '', success: raw.successCriteria || '', data: raw.data || '',
    need: raw.need || '', interactionFormat: raw.interactionFormat || '', constraints: raw.constraints || '', users: raw.users || '', contact: raw.contact || '',
    ownerId: 'business-1', // Shared demo workspace; replace with authenticated session when available.
    status: !raw.published ? 'draft' : raw.selectionDone ? (raw.selectedTeamIds?.length ? 'in_progress' : 'closed') : 'published',
    selectionDone: Boolean(raw.selectionDone), selectedTeamIds: raw.selectedTeamIds || [], offerCount, rating: rating(raw)
  });
  const offer = raw => ({ id: raw.id, taskId: raw.taskId, teamId: raw.teamId || raw.id,
    team: raw.teamName, members: raw.members || 'Состав не указан', approach: raw.idea, plan: raw.plan,
    duration: raw.deadline, contact: raw.contact || 'Контакт не указан', prototypeUrl: raw.prototypeUrl,
    status: raw.status === 'rejected' ? 'declined' : raw.status
  });
  async function saveDraft(draft) {
    const raw = await request(draftId ? '/tasks/' + route(draftId) : '/tasks', draftId ? 'PATCH' : 'POST', toServer(draft));
    remember(raw.id); return task(raw);
  }
  window.platformApi = {
    meta: { mode: 'live', persistent: true },
    listTasks: async () => (await request('/tasks')).map(raw => task(raw)),
    getTask: async id => task(await request('/tasks/' + route(id))),
    getQuestions: async description => (await request('/questions', 'POST', { context: description })).map(q => ({ ...q, key: keys[q.key] || q.key })),
    rateTask: async draft => rating(await request('/rating', 'POST', toServer(draft))),
    async getDraft() {
      if (draftId) {
        try { const raw = await request('/tasks/' + route(draftId)); if (!raw.published) return task(raw); }
        catch (error) { if (error.status !== 404) throw error; }
        remember('');
      }
      const drafts = (await request('/tasks?all=true')).filter(t => !t.published);
      if (!drafts.length) return null;
      remember(drafts[0].id); return task(drafts[0]);
    },
    async openDraft(id) {
      const raw = await request('/tasks/' + route(id));
      if (raw.published) throw new Error('Эта задача уже опубликована');
      remember(id); return task(raw);
    },
    saveDraft,
    async publishTask(draft) {
      await saveDraft(draft);
      const raw = await request('/tasks/' + route(draftId) + '/publish', 'POST');
      remember(''); return task(raw);
    },
    listOffers: async id => (await request('/tasks/' + route(id) + '/proposals')).map(offer),
    submitOffer: async (id, data) => offer(await request('/tasks/' + route(id) + '/proposals', 'POST', {
      teamId: currentTeam().id, teamName: currentTeam().name, members: data.members, contact: data.contact,
      idea: data.approach, plan: data.plan, deadline: data.duration, prototypeUrl: data.prototypeUrl || ''
    })),
    decideOffer: async (id, status) => offer(await request('/proposals/' + route(id) + '/status', 'PATCH', { status: status === 'declined' ? 'rejected' : status })),
    selectOffers: async (id, proposalIds) => task(await request('/tasks/' + route(id) + '/selection', 'POST', { proposalIds })),
    selectTeams: async (id, teamIds) => task(await request('/tasks/' + route(id) + '/selection', 'POST', { teamIds })),
    async getWorkspace(role) {
      const [rawTasks, stages] = await Promise.all([request('/tasks?all=true'), request('/stages')]);
      const groups = await Promise.all(rawTasks.map(t => request('/tasks/' + route(t.id) + '/proposals')));
      const offers = groups.flat().map(offer);
      const tasks = rawTasks.map((raw, index) => task(raw, groups[index].length));
      return role === 'business' ? { tasks, offers, stages } : {
        tasks: tasks.filter(t => offers.some(o => o.taskId === t.id && o.teamId === currentTeam().id)),
        offers: offers.filter(o => o.teamId === currentTeam().id), stages: stages.filter(s => s.teamId === currentTeam().id)
      };
    },
    submitStage: (id, data) => request('/stages/' + route(id) + '/submit', 'POST', data),
    reviewStage: (id, approved, feedback) => request('/stages/' + route(id) + '/review', 'POST', { approved, feedback })
  };
})();
