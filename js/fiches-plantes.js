/* Fiches plantes et fruits de la page Espèces, au même gabarit que les champignons (cinq étapes), lues dans
   data/plantes/. Affichées seulement si MW.INTERRUPTEURS.plantes ; sinon « En préparation ».
   Chaque fiche non relue porte « À relire par un botaniste ». Jamais de plante de la famille de la carotte. */
(function () {
  const zone = document.getElementById('fichesPlantes');
  if (!zone) return;
  const MW = window.MW || {}, I = MW.INTERRUPTEURS || {};
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const admise = (e) => e && (e.famille === 'plante' || e.famille === 'fruit') && !/apiac|ombellif/i.test(e.famille_botanique || '');
  const ETAPES = [['trouver', 'Trouver'], ['reconnaitre', 'Reconnaître'], ['cueillir', 'Cueillir'], ['cuisiner', 'Cuisiner'], ['conserver', 'Conserver']];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V11"/><path d="M12 15c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c0-4 2-7 6-7 0 4-2 7-6 7z"/></svg>';
  const preparation = () => { zone.innerHTML = '<p class="discret">En préparation : les fiches plantes et fruits sont en cours de relecture par un botaniste.</p>'; };
  if (!(I.plantes === true || LOCAL)) return preparation();

  (async () => {
    try {
      const idx = await (await fetch('data/plantes/index.json')).json();
      const liste = (idx.especes || []).filter(admise);
      if (!liste.length) return preparation();
      const fiches = await Promise.all(liste.map((e) => fetch('data/plantes/' + encodeURIComponent(e.id) + '.json').then((r) => r.json()).then((f) => Object.assign({}, e, f)).catch(() => null)));
      zone.innerHTML = fiches.filter(admise).map((f) => '<article class="carte fiche" id="' + esc(f.id) + '" data-famille="' + esc(f.famille) + '">' +
        '<span class="famille">' + ICONE + (f.famille === 'fruit' ? 'Fruit' : 'Plante') + '</span>' +
        '<h2 style="font-size:24px;margin-top:10px"><span class="point" style="background:' + esc(f.couleur) + '"></span>' + esc(f.nom) + '</h2>' +
        '<p class="discret petit"><i>' + esc(f.latin) + '</i>' + (f.relu_botaniste === true ? '' : ' · <span class="a-relire">' + esc(f.bandeau || 'À relire par un botaniste') + '</span>') + '</p>' +
        '<ul class="reperes">' + ETAPES.map(([k, l]) => '<li><a href="#' + esc(f.id) + '-' + k + '">' + l + '</a></li>').join('') + '</ul>' +
        ETAPES.map(([k, l]) => '<div class="etape" id="' + esc(f.id) + '-' + k + '"><h3>' + l + '</h3><p>' + esc((f.etapes || {})[k] || 'À compléter.') + '</p>' +
          (k === 'reconnaitre' && f.sosies ? '<p class="sosie"><b>Sosies :</b> ' + esc(f.sosies) + '</p>' : '') +
          (k === 'trouver' && f.mois ? '<p class="petit discret">Saison : ' + f.mois.map((m) => MOIS[m - 1]).join(', ') + '. <a href="carte.html?mode=plantes">Voir ses milieux sur la carte</a></p>' : '') + '</div>').join('') +
        '</article>').join('');
    } catch (e) { preparation(); }
  })();
})();
