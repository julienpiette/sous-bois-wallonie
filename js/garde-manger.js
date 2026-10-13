/* Garde-manger local : bocaux et sachets (espèce, méthode, poids, date, « à consommer avant »).
   Stocké dans IndexedDB sur ce téléphone, jamais envoyé nulle part. Base 'sb-garde-manger' (nom stable,
   indépendant du nom du site, pour ne jamais perdre les données lors d'un changement de nom). */
(function () {
  const MW = window.MW, $ = (s) => document.querySelector(s);
  const zone = $('#gm');
  if (!zone) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // durée proposée par défaut (jours), à ajuster par chacun ; l'huile suit la règle de sécurité : 7 jours au frigo
  const METHODES = {
    sechage: ['Séchage', 365], congelation: ['Congélation', 180], sucre: ['Sucre (confiture, gelée, sirop)', 365],
    vinaigre: ['Vinaigre', 180], huile: ['Huile (au frigo)', 7], sterilisation: ['Stérilisation en bocaux', 365]
  };
  const aujourdhui = () => (MW.droit ? MW.droit.todayISO() : new Date().toISOString().slice(0, 10));
  const plus = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  // ---------- IndexedDB ----------
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((ok, ko) => {
      if (!('indexedDB' in window)) return ko(new Error('IndexedDB indisponible'));
      const r = indexedDB.open('sb-garde-manger', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('bocaux', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    return dbP;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((ok, ko) => {
      const t = d.transaction('bocaux', mode), st = t.objectStore('bocaux'), req = fn(st);
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => ko(t.error);
    });
  }
  const tous = () => tx('readonly', (st) => st.getAll());
  const ajouter = (b) => tx('readwrite', (st) => st.put(b));
  const retirer = (id) => tx('readwrite', (st) => st.delete(id));

  // ---------- formulaire ----------
  const selE = $('#gm-espece'), selM = $('#gm-methode'), date = $('#gm-date'), avant = $('#gm-avant');
  MW.SPECIES.forEach((sp) => { const o = document.createElement('option'); o.value = sp.id; o.textContent = sp.name; selE.appendChild(o); });
  Object.keys(METHODES).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = METHODES[k][0]; selM.appendChild(o); });
  date.value = aujourdhui();
  const proposer = () => { avant.value = plus(date.value || aujourdhui(), METHODES[selM.value][1]); $('#gm-huile').hidden = selM.value !== 'huile'; };
  selM.onchange = proposer; date.onchange = proposer; proposer();
  const msg = (t) => { $('#gm-msg').textContent = t; };

  $('#gm-ajout').onclick = async () => {
    const g = +String($('#gm-poids').value).replace(',', '.');
    try {
      await ajouter({ id: Date.now(), espece: selE.value, methode: selM.value, poids: g > 0 ? g : null, date: date.value || aujourdhui(),
        avant: avant.value || plus(aujourdhui(), METHODES[selM.value][1]), note: $('#gm-note').value.trim() });
      $('#gm-poids').value = ''; $('#gm-note').value = '';
      msg('Ajouté au garde-manger de ce téléphone.');
      afficher();
    } catch (e) { msg('Enregistrement impossible sur ce navigateur (mode privé ?).'); }
  };

  // ---------- liste ----------
  async function afficher() {
    let l = [];
    try { l = await tous(); } catch (e) { $('#gm-liste').innerHTML = '<p class="discret">Le garde-manger n’est pas disponible sur ce navigateur.</p>'; return; }
    l.sort((a, b) => a.avant.localeCompare(b.avant));
    $('#gm-vide').hidden = l.length > 0;
    const auj = aujourdhui();
    $('#gm-liste').innerHTML = l.map((b) => {
      const sp = MW.SPECIES.find((s) => s.id === b.espece) || { name: b.espece, color: '#999' };
      const depasse = b.avant < auj;
      return '<div class="gm" data-id="' + b.id + '"><div><b><span class="point" style="background:' + sp.color + '"></span>' + esc(sp.name) + '</b> · ' +
        esc((METHODES[b.methode] || [b.methode])[0]) + (b.poids ? ' · ' + esc(String(b.poids).replace('.', ',')) + ' g' : '') +
        '<div class="avant' + (depasse ? ' depasse' : '') + '">' + (depasse ? 'Date dépassée : ' : 'À consommer avant le ') + esc(fmt(b.avant)) + '</div>' +
        (b.note ? '<div class="petit discret">' + esc(b.note) + '</div>' : '') + '</div>' +
        '<button type="button" class="btn ligne" aria-label="Retirer du garde-manger">Retirer</button></div>';
    }).join('');
    $('#gm-liste').querySelectorAll('.gm button').forEach((btn) => {
      btn.onclick = async () => { await retirer(+btn.closest('.gm').dataset.id); afficher(); };
    });
  }

  window.SB_GM = {
    preremplir(espece, poids) {
      selE.value = espece; if (poids) $('#gm-poids').value = String(poids).replace('.', ',');
      zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  afficher();
})();
