/* Grille de points + récupération Open-Meteo (sans clé, usage non commercial). */
(function (root) {
  const MW = (root.MW = root.MW || {});

  function buildGrid() {
    const B = MW.BBOX, G = MW.GRID, pts = [];
    for (let lat = B.south; lat <= B.north + G.latStep / 2; lat += G.latStep) {
      for (let lon = B.west; lon <= B.east + G.lonStep / 2; lon += G.lonStep) {
        const la = +lat.toFixed(3), lo = +lon.toFixed(3);
        if (MW.geo.pointInPolygon(lo, la, MW.WALLONIA) || MW.geo.distToPolygon(lo, la, MW.WALLONIA) < G.buffer)
          pts.push({ lat: la, lon: lo });
      }
    }
    return pts;
  }

  function todayBrussels() {
    try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function clean(arr, fill) {
    let last = fill;
    return arr.map((v) => { if (v == null || isNaN(v)) return last; last = v; return v; });
  }

  function parse(res) {
    const d = res.daily;
    return { time: d.time, precip: clean(d.precipitation_sum, 0), tmean: clean(d.temperature_2m_mean, 10), tmin: clean(d.temperature_2m_min, 5) };
  }

  async function fetchBatch(batch, tries) {
    const G = MW.GRID;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + batch.map((p) => p.lat).join(',') +
      '&longitude=' + batch.map((p) => p.lon).join(',') +
      '&daily=precipitation_sum,temperature_2m_mean,temperature_2m_min' +
      '&past_days=' + G.pastDays + '&forecast_days=' + G.forecastDays + '&timezone=Europe%2FBrussels';
    // délai maximum : sans réponse en 25 s, la page affiche son état d'erreur (avec « Réessayer ») au lieu d'attendre sans fin
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const minuteur = ctl ? setTimeout(() => ctl.abort(), 90000) : null;
    let r;
    try { r = await fetch(url, ctl ? { signal: ctl.signal } : undefined); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'Open-Meteo ne répond pas' : 'réseau indisponible'); }
    finally { if (minuteur) clearTimeout(minuteur); }
    if (r.status === 429 && tries < 3) {
      await new Promise((ok) => setTimeout(ok, 1500 * (tries + 1)));
      return fetchBatch(batch, tries + 1);
    }
    if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
    const j = await r.json();
    return (Array.isArray(j) ? j : [j]).map(parse);
  }

  // → { series:[…par point], todayIdx, fetchedAt, fromCache, ancien } ; cle = cache localStorage (carte ou bulletin)
  // taille = points par requête (Open-Meteo répond en un temps proportionnel au nombre de points : pour quelques points,
  // deux requêtes moyennes à la fois vont plus vite qu'une seule grosse ; au-delà, Open-Meteo refuse : 429)
  async function load(grid, onProgress, cle, taille) {
    const G = MW.GRID, key = cle || 'mw-weather-v2', lot = taille || G.batchSize;
    let c = null;
    try { c = JSON.parse(localStorage.getItem(key)); } catch (e) { /* cache absent */ }
    if (c && c.n === grid.length && c.day === todayBrussels() && Date.now() - c.t < G.cacheHours * 3600e3)
      return { series: c.series, todayIdx: c.todayIdx, fetchedAt: c.t, fromCache: true };
    const lots = [];
    for (let i = 0; i < grid.length; i += lot) lots.push(grid.slice(i, i + lot));
    const parts = new Array(lots.length);
    let faits = 0, prochain = 0;
    async function ouvrier() {
      while (prochain < lots.length) {
        const k = prochain++;
        parts[k] = await fetchBatch(lots[k], 0);
        faits += lots[k].length;
        if (onProgress) onProgress(Math.min(1, faits / grid.length));
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(2, lots.length) }, ouvrier));
    } catch (e) {
      // météo injoignable : le dernier bulletin enregistré, s'il existe, signalé comme ancien
      if (c && c.n === grid.length) return { series: c.series, todayIdx: c.todayIdx, fetchedAt: c.t, fromCache: true, ancien: true };
      throw e;
    }
    const series = [].concat(...parts);
    let idx = series[0].time.indexOf(todayBrussels());
    if (idx < 0) idx = G.pastDays;
    const out = { series, todayIdx: idx, fetchedAt: Date.now(), fromCache: false };
    try { localStorage.setItem(key, JSON.stringify({ n: grid.length, day: todayBrussels(), t: out.fetchedAt, series, todayIdx: idx })); } catch (e) { /* quota */ }
    return out;
  }

  MW.weather = { buildGrid, load, todayBrussels };
})(typeof window !== 'undefined' ? window : globalThis);
