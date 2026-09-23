/* Local team switcher for the shared hackathon demo. This is not authentication. */
(() => {
  'use strict';
  let name = 'Orbit';
  try { name = localStorage.getItem('most-active-team') || name; } catch (_) {}
  const identity = value => value.toLowerCase() === 'вектор' ? 'team-vector' : 'team-' + value.normalize('NFKC').toLowerCase();
  window.platformTeam = {
    get current() { return { id: identity(name), name }; },
    set(value) {
      const next = String(value).trim();
      if (!next || next.length > 80) throw new Error('Название команды: от 1 до 80 символов');
      name = next;
      try { localStorage.setItem('most-active-team', name); } catch (_) {}
      return this.current;
    }
  };
})();
