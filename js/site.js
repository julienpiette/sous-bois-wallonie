/* Commun à toutes les pages : menu, appli installable (service worker + invitation), état du réseau,
   réglages (js/site-config.js), glossaire, calendrier des saisons, fiches matériel. */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };
  window.SB = { esc, store };

  // ---------- bandeaux de battue : une croix pour fermer chaque bandeau (il revient à sa prochaine apparition) ----------
  // les encadrés explicatifs fixes (data-fixe) n'en ont pas
  const CROIX = '<button type="button" class="alerte-fermer" aria-label="Fermer ce bandeau"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  const ajouterCroix = () => $$('.alerte-battue:not([data-fixe])').forEach((a) => { if (!a.querySelector(':scope > .alerte-fermer')) a.insertAdjacentHTML('beforeend', CROIX); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.alerte-fermer'); if (!b) return;
    const a = b.closest('.alerte-battue'); a.hidden = true;
    a.dispatchEvent(new CustomEvent('alerte-fermee', { bubbles: true }));
  });
  let croixPrevue = false;
  ajouterCroix();
  new MutationObserver(() => { if (croixPrevue) return; croixPrevue = true; requestAnimationFrame(() => { croixPrevue = false; ajouterCroix(); }); })
    .observe(document.body, { childList: true, subtree: true });

  // ---------- méga menu (tout le site, rangé par moment de la sortie) ----------
  const btn = $('.menu-btn'), mega = $('#mega');
  if (btn && mega) {
    const ouvrir = (o) => {
      mega.hidden = !o; btn.setAttribute('aria-expanded', o);
      document.documentElement.classList.toggle('mega-ouvert', o);
    };
    btn.addEventListener('click', () => ouvrir(mega.hidden));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mega.hidden) { ouvrir(false); btn.focus(); } });
    document.addEventListener('click', (e) => { if (!mega.hidden && !mega.contains(e.target) && !btn.contains(e.target)) ouvrir(false); });
    // un lien vers une ancre de la page courante ferme le menu
    mega.addEventListener('click', (e) => { if (e.target.closest('a')) ouvrir(false); });
  }

  // ---------- appli installable ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ }));
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let invite = null;
  const installBtns = $$('.installer-btn');
  function bandeau(texte, action) {
    const vu = store.get('sb-installer-vu', 0);
    // jamais par-dessus la carte : l'invitation attend une page de contenu
    if (standalone || Date.now() - vu < 30 * 864e5 || $('.installer') || document.body.classList.contains('carte-page')) return;
    const d = document.createElement('div');
    d.className = 'installer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Installer l’appli');
    d.innerHTML = '<p>' + texte + '</p>' + (action ? '<button type="button" class="oui-installer">Installer</button>' : '') + '<button type="button" class="plus-tard">Plus tard</button>';
    document.body.appendChild(d);
    const fermer = () => { store.set('sb-installer-vu', Date.now()); d.remove(); };
    d.querySelector('.plus-tard').onclick = fermer;
    if (action) d.querySelector('.oui-installer').onclick = () => { fermer(); action(); };
  }
  async function installer() {
    if (!invite) return;
    invite.prompt();
    await invite.userChoice.catch(() => null);
    invite = null; installBtns.forEach((b) => { b.hidden = true; });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); invite = e;
    installBtns.forEach((b) => { b.hidden = false; b.onclick = installer; });
    setTimeout(() => bandeau('Ajoute Musette à ton écran d’accueil : bulletin, carte et carnet à un geste, même sous les épicéas.', installer), 4000);
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  if (ios && !standalone) {
    installBtns.forEach((b) => { b.hidden = false; b.onclick = () => bandeau('Sur iPhone : touche le bouton Partager, puis « Sur l’écran d’accueil ».', null); });
    setTimeout(() => bandeau('Sur iPhone : touche Partager puis « Sur l’écran d’accueil » pour garder Musette sous la main.', null), 6000);
  }

  // ---------- état du réseau ----------
  function reseau() {
    let b = $('.hors-reseau');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'hors-reseau'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = 'Pas de réseau : tu vois la dernière version enregistrée';
  }
  window.addEventListener('online', reseau); window.addEventListener('offline', reseau); reseau();

  // ---------- réglages : liens et textes à compléter (js/site-config.js) ----------
  const C = window.SITE || {};
  $$('[data-lien]').forEach((a) => {
    const v = C[a.dataset.lien];
    if (v) { a.href = a.dataset.lien === 'contactEmail' ? 'mailto:' + v : v; a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); if (a.dataset.sinon) a.textContent = a.dataset.sinon; }
  });
  $$('[data-texte]').forEach((el) => {
    const v = el.dataset.texte.split('.').reduce((o, k) => (o ? o[k] : ''), C);
    el.textContent = v || el.dataset.sinon || '';
  });

  // ---------- glossaire : filtre sans accents ----------
  const q = $('#q-gloss');
  if (q) {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const termes = $$('.gloss .terme').map((el) => ({ el, txt: norm(el.textContent) }));
    q.addEventListener('input', () => {
      const v = norm(q.value.trim());
      termes.forEach((t) => { t.el.hidden = v && !t.txt.includes(v); });
      $$('.gloss .lettre').forEach((l) => { l.hidden = !!v; });
      $('#gloss-vide').hidden = termes.some((t) => !t.el.hidden);
    });
  }

  // ---------- calendrier des saisons et espèces du moment (MW.SPECIES + MW.model) ----------
  const MW = window.MW, mois = new Date().getMonth();
  const cal = $('#calendrier');
  if (cal && MW && MW.model) {
    const M = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    cal.innerHTML = '<table><thead><tr><th>Espèce</th>' +
      M.map((x, i) => '<th' + (i === mois ? ' style="color:var(--mousse);font-weight:700"' : '') + '>' + x + '</th>').join('') + '</tr></thead><tbody>' +
      MW.SPECIES.map((sp) => '<tr><td><a href="especes.html#' + sp.id + '"><span class="point" style="background:' + sp.color + '"></span>' + esc(sp.name) + '</a></td>' +
        MW.model.monthWeights(sp).map((w, i) => '<td' + (i === mois ? ' style="background:var(--mousse-2)"' : '') + '><i title="' + M[i] + ' : ' +
          (w >= 0.9 ? 'pleine saison' : w > 0 ? 'début ou fin de saison' : 'hors saison') + '" style="background:' + (w > 0 ? sp.color : 'transparent') +
          ';opacity:' + (w > 0 ? 0.3 + 0.7 * w : 1) + '"></i></td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  const now = $('#maintenant');
  if (now && MW && MW.model) {
    const en = MW.SPECIES.filter((sp) => MW.model.monthWeights(sp)[mois] >= 0.5);
    now.innerHTML = en.length
      ? en.map((sp) => '<a class="etiquette" href="especes.html#' + sp.id + '"><span class="point" style="background:' + sp.color + ';width:8px;height:8px;margin-right:6px"></span>' + esc(sp.name) + '</a>').join('')
      : '<span class="discret">Peu d’espèces en saison ce mois-ci : prépare tes coins sur la carte.</span>';
  }

  // ---------- matériel ----------
  const liste = $('#produits');
  if (liste && window.PRODUITS) {
    liste.innerHTML = window.PRODUITS.map((p) => {
      const lien = p.lien && p.lien.trim();
      return '<article class="carte produit">' +
        '<div class="ico" aria-hidden="true">' + (window.ICONES[p.icone] || '') + '</div>' +
        '<span class="ess"' + (p.essentiel ? '' : ' style="color:var(--humus-2)"') + '>' + (p.essentiel ? 'Essentiel' : 'Utile') + '</span>' +
        '<h3>' + esc(p.nom) + '</h3><p>' + esc(p.pourquoi) + '</p>' +
        '<p class="conseil"><b>À vérifier :</b> ' + esc(p.conseil) + '</p>' +
        (lien
          ? '<a class="btn signal" href="' + esc(lien) + '" target="_blank" rel="sponsored noopener">' + esc(p.bouton || 'Voir chez le partenaire') + ' ↗</a>'
          : '<span class="btn ligne" aria-disabled="true">Lien partenaire bientôt</span>') +
        '</article>';
    }).join('');
  }
})();
