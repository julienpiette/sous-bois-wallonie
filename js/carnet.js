/* Carnet local : tes coins restent sur ce téléphone (localStorage, clé 'mw-coins', partagée avec la carte).
   Ajout à ta position, stats, battues sur tes coins, sauvegarde chiffrée (AES-GCM, phrase secrète), bilan de saison. */
(function () {
  const MW = window.MW, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const RES = { beaucoup: 'Beaucoup', peu: 'Peu', rien: 'Rien' };
  const espece = (id) => MW.SPECIES.find((s) => s.id === id) || { name: id, color: '#999' };
  let coins = store.get('mw-coins', []);
  const enregistrer = () => { store.set('mw-coins', coins); afficher(); };

  // ---------- formulaire ----------
  const sel = $('#c-espece');
  MW.SPECIES.forEach((sp) => { const o = document.createElement('option'); o.value = sp.id; o.textContent = sp.name; sel.appendChild(o); });
  function ajouter(lat, lon) {
    coins.push({ id: Date.now(), lat: +lat.toFixed(5), lon: +lon.toFixed(5), date: MW.droit.todayISO(), species: sel.value,
      result: $('#c-resultat').value, litres: +$('#c-litres').value.replace(',', '.') || null, poids: +$('#c-poids').value.replace(',', '.') || null, note: $('#c-note').value.trim() });
    const poids = coins[coins.length - 1].poids, esp = coins[coins.length - 1].species;
    $('#c-note').value = ''; $('#c-litres').value = ''; $('#c-poids').value = '';
    enregistrer();
    msg('Coin enregistré sur ce téléphone.');
    if (poids) suite(esp, poids);
  }
  const msg = (t) => { $('#c-msg').textContent = t; };
  // récolte pesée : proposer recettes, conservation et garde-manger (rien ne quitte le téléphone)
  function suite(esp, poids) {
    const s = $('#c-suite'); if (!s) return;
    const g = String(poids).replace('.', ',');
    s.innerHTML = '<p><b>' + esc(g) + ' g de ' + esc(espece(esp).name.toLowerCase()) + ' : et maintenant ?</b></p><div class="btns">' +
      '<a class="btn ligne" href="recettes.html?espece=' + encodeURIComponent(esp) + '&poids=' + encodeURIComponent(poids) + '">Recettes à la bonne quantité</a>' +
      '<a class="btn ligne" href="conservation.html">Conserver</a>' +
      '<a class="btn ligne" href="#garde-manger" data-gm-espece="' + esc(esp) + '" data-gm-poids="' + esc(poids) + '">Ajouter au garde-manger</a></div>';
    s.hidden = false;
    const a = s.querySelector('[data-gm-espece]');
    a.onclick = () => { if (window.SB_GM) window.SB_GM.preremplir(a.dataset.gmEspece, +a.dataset.gmPoids); };
  }
  $('#c-ici').onclick = () => {
    if (!navigator.geolocation) return msg('Ce navigateur ne donne pas ta position : ajoute le coin depuis la carte.');
    msg('Recherche de ta position…');
    navigator.geolocation.getCurrentPosition((p) => ajouter(p.coords.latitude, p.coords.longitude),
      () => msg('Position indisponible. Autorise la localisation, ou ajoute le coin depuis la carte.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  };

  // ---------- liste et chiffres ----------
  function afficher() {
    const ul = $('#c-liste');
    // carnet vide : pas de chiffres à zéro ni de vérification sans objet, seulement l'invitation à noter un premier coin
    $('#c-vide').hidden = coins.length > 0;
    $('#c-chiffres').hidden = !coins.length;
    $('#c-battues').closest('.btns').hidden = !coins.length;
    ul.innerHTML = coins.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((c) => {
      const sp = espece(c.species);
      return '<div class="coin" data-id="' + c.id + '"><span class="point" style="background:' + sp.color + '"></span>' +
        '<div><b>' + esc(sp.name) + '</b> · ' + esc(RES[c.result] || c.result) + (c.litres ? ' · ' + c.litres + ' L' : '') + (c.poids ? ' · ' + c.poids + ' g' : '') +
        '<div class="petit discret">' + esc(MW.droit.formatDate(c.date || MW.droit.todayISO())) + (c.note ? ' · ' + esc(c.note) : '') + '</div>' +
        '<div class="petit battue-coin"></div></div>' +
        '<div class="actions"><a class="btn ligne" href="carte.html#16/' + c.lat + '/' + c.lon + '" aria-label="Voir sur la carte">Carte</a>' +
        '<button type="button" class="btn ligne suppr" aria-label="Supprimer ce coin">×</button></div></div>';
    }).join('');
    ul.querySelectorAll('.suppr').forEach((b) => {
      b.onclick = () => {
        const id = +b.closest('.coin').dataset.id;
        if (!confirm('Supprimer ce coin du carnet ?')) return;
        coins = coins.filter((c) => c.id !== id); enregistrer();
      };
    });
    const dates = new Set(coins.map((c) => c.date)), parEsp = {};
    coins.forEach((c) => { parEsp[c.species] = (parEsp[c.species] || 0) + (c.result === 'beaucoup' ? 3 : c.result === 'peu' ? 1 : 0); });
    const reine = Object.keys(parEsp).sort((a, b) => parEsp[b] - parEsp[a])[0];
    const litres = coins.reduce((s, c) => s + (c.litres || 0), 0);
    $('#c-chiffres').innerHTML = '<div><b>' + coins.length + '</b><span>coins notés</span></div><div><b>' + dates.size + '</b><span>sorties</span></div>' +
      '<div><b>' + (litres ? Math.round(litres) : '–') + '</b><span>litres</span></div><div><b style="font-size:20px">' + esc(reine ? espece(reine).name : '–') + '</b><span>espèce reine</span></div>';
    const vu = store.get('sb-sauvegarde', 0);
    $('#c-rappel').hidden = !coins.length || Date.now() - vu < 30 * 864e5;
  }

  // ---------- battues sur mes coins ----------
  $('#c-battues').onclick = async () => {
    const b = $('#c-battues'); b.disabled = true; b.textContent = 'Vérification…';
    const fin = MW.droit.addDays(MW.droit.todayISO(), 14);
    let alertes = 0;
    for (const el of document.querySelectorAll('.coin')) {
      const c = coins.find((x) => x.id === +el.dataset.id), out = el.querySelector('.battue-coin');
      try {
        const t = await MW.droit.territoireAuPoint(c.lat, c.lon);
        const prochaines = t.dates.filter((d) => d.date >= MW.droit.todayISO() && d.date <= fin);
        if (prochaines.length) { alertes++; out.innerHTML = '<span class="statut non">Fermé</span> ' + prochaines.map((d) => esc(MW.droit.formatDate(d.date, true)) + ' (' + esc(d.type) + ')').join(', '); }
        else out.textContent = 'Aucune fermeture déclarée dans les 14 jours.';
      } catch (e) { out.textContent = 'Battues : données indisponibles.'; }
    }
    b.disabled = false; b.textContent = 'Vérifier les battues sur mes coins (14 jours)';
    msg(alertes ? alertes + ' coin(s) concerné(s) par une fermeture dans les 14 jours.' : 'Aucune fermeture déclarée sur tes coins dans les 14 jours.');
  };

  // ---------- sauvegarde et transmission ----------
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function cle(phrase, sel) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function telecharger(nom, contenu) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#c-export').onclick = () => { telecharger('carnet-sous-bois.json', JSON.stringify(coins, null, 2)); store.set('sb-sauvegarde', Date.now()); afficher(); };
  $('#c-chiffre').onclick = async () => {
    const phrase = $('#c-phrase').value;
    if (phrase.length < 8) return msg('Choisis une phrase secrète d’au moins 8 caractères (et note-la : sans elle, le fichier est illisible).');
    const sel = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(phrase, sel), new TextEncoder().encode(JSON.stringify(coins)));
    telecharger('carnet-sous-bois-chiffre.json', JSON.stringify({ format: 'sous-bois-carnet', v: 1, sel: b64(sel), iv: b64(iv), data: b64(data) }));
    store.set('sb-sauvegarde', Date.now()); afficher();
    msg('Carnet chiffré téléchargé. Garde la phrase secrète à part (ou transmets-la de vive voix).');
  };
  $('#c-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      let j = JSON.parse(await f.text());
      if (j && j.format === 'sous-bois-carnet') {
        const phrase = $('#c-phrase').value || prompt('Phrase secrète du carnet :') || '';
        const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(j.iv) }, await cle(phrase, deb64(j.sel)), deb64(j.data));
        j = JSON.parse(new TextDecoder().decode(clair));
      }
      if (!Array.isArray(j)) throw new Error('format');
      const ids = new Set(coins.map((c) => c.id));
      const nouveaux = j.filter((c) => c && c.lat && c.lon && !ids.has(c.id));
      coins = coins.concat(nouveaux); enregistrer();
      msg(nouveaux.length + ' coin(s) ajouté(s) au carnet.');
    } catch (err) { msg('Import impossible : fichier illisible ou phrase secrète incorrecte.'); }
  });

  // ---------- bilan de saison (image sans aucun lieu) ----------
  $('#c-bilan').onclick = () => {
    const an = MW.droit.todayISO().slice(0, 4), cs = coins.filter((c) => (c.date || '').startsWith(an));
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#1e3b26'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#cde46a'; g.fillRect(80, 120, 120, 12);
    g.fillStyle = '#f3f6ea'; g.font = '400 96px "Lilita One", sans-serif'; g.fillText('Ma saison ' + an, 80, 250);
    g.font = '600 34px "Instrument Sans", sans-serif'; g.fillStyle = '#c4d0b8'; g.fillText((document.querySelector('meta[name=apple-mobile-web-app-title]') || { content: '' }).content + ' · carnet', 80, 320);
    const dates = new Set(cs.map((c) => c.date)), parEsp = {};
    cs.forEach((c) => { parEsp[c.species] = (parEsp[c.species] || 0) + 1; });
    const lignes = [['Sorties', dates.size], ['Coins notés', cs.length], ['Litres', Math.round(cs.reduce((s, c) => s + (c.litres || 0), 0)) || '–']];
    lignes.forEach(([k, v], i) => {
      g.fillStyle = '#f3f6ea'; g.font = '600 120px "Instrument Sans", sans-serif'; g.fillText(String(v), 80, 520 + i * 200);
      g.fillStyle = '#c4d0b8'; g.font = '400 36px "Instrument Sans", sans-serif'; g.fillText(k, 80, 570 + i * 200);
    });
    let y = 1060;
    Object.keys(parEsp).sort((a, b) => parEsp[b] - parEsp[a]).slice(0, 3).forEach((id) => {
      const sp = espece(id); g.fillStyle = sp.color; g.beginPath(); g.arc(98, y - 12, 16, 0, 7); g.fill();
      g.fillStyle = '#f3f6ea'; g.font = '400 40px "Instrument Sans", sans-serif'; g.fillText(sp.name + ' · ' + parEsp[id], 134, y); y += 64;
    });
    g.fillStyle = '#c4d0b8'; g.font = '400 28px "Instrument Sans", sans-serif'; g.fillText('Aucun lieu sur cette image : les coins restent secrets.', 80, H - 80);
    cv.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ma-saison-' + an + '.png'; document.body.appendChild(a); a.click(); a.remove(); });
  };

  afficher();
})();
