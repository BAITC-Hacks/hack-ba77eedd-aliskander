/* Debounced, ordered draft persistence. No DOM or business rules. */
(() => {
  'use strict';
  window.createDraftAutosave = ({ save, onStatus = () => {}, delay = 700 }) => {
    let revision = 0;
    let savedRevision = 0;
    let latest = null;
    let timer = null;
    let inflight = null;
    let status = 'idle';
    const dirty = () => revision !== savedRevision;
    const emit = next => { status = next; onStatus(next); };
    const flush = () => {
      clearTimeout(timer);
      if (inflight) return inflight.then(() => dirty() ? flush() : undefined);
      if (!dirty()) return Promise.resolve();
      const version = revision;
      const snapshot = { ...latest };
      emit('saving');
      inflight = Promise.resolve().then(() => save(snapshot))
        .then(() => { savedRevision = version; emit(dirty() ? 'pending' : 'saved'); })
        .catch(error => { emit('error'); throw error; })
        .finally(() => { inflight = null; });
      return inflight.then(() => dirty() ? flush() : undefined);
    };
    return {
      update(draft) {
        latest = { ...draft };
        revision += 1;
        emit('pending');
        clearTimeout(timer);
        timer = setTimeout(() => flush().catch(() => {}), delay);
      },
      flush,
      dirty,
      get status() { return status; },
      reset() {
        if (inflight) throw new Error('Wait for draft persistence before reset.');
        clearTimeout(timer);
        revision = savedRevision = 0;
        latest = null;
        emit('idle');
      }
    };
  };
})();
