/* Indice météo I = P × D × T × S × G × C  (voir le dossier de méthode).
   P pluie déclencheuse décalée · D lessivage récent · T température · S mémoire de sécheresse
   G gel · C calendrier. Tous les seuils sont des hypothèses. */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function sum(arr, a, b) {
    a = Math.max(0, a); b = Math.min(arr.length - 1, b);
    let s = 0; for (let i = a; i <= b; i++) s += arr[i] || 0; return s;
  }
  function mean(arr, a, b) {
    a = Math.max(0, a); b = Math.min(arr.length - 1, b);
    let s = 0, n = 0; for (let i = a; i <= b; i++) { s += arr[i]; n++; } return n ? s / n : 0;
  }
  function minOf(arr, a, b) {
    a = Math.max(0, a); b = Math.min(arr.length - 1, b);
    let m = Infinity; for (let i = a; i <= b; i++) if (arr[i] < m) m = arr[i]; return m === Infinity ? 0 : m;
  }
  function trap(x, t) {
    const a = t[0], b = t[1], c = t[2], d = t[3];
    if (x <= a || x >= d) return 0;
    if (x < b) return (x - a) / (b - a);
    if (x <= c) return 1;
    return (d - x) / (d - c);
  }
  function rainIndex(r, mm) {
    if (mm < r.min) return 0.6 * (mm / r.min);
    if (mm < r.opt) return 0.6 + 0.4 * ((mm - r.min) / (r.opt - r.min));
    return 1;
  }
  function calendar(sp, md) {
    for (const s of sp.season) if (md >= s[0] && md <= s[1]) return s[2];
    return 0;
  }

  // normale du bilan 90 jours au jour donné : interpolée entre les valeurs du 15 de chaque mois
  function normaleBilan(iso) {
    const N = MW.NORMALES_BILAN_90J, m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
    const a = d >= 15 ? m : (m + 11) % 12, b = (a + 1) % 12, f = d >= 15 ? (d - 15) / 30 : (d + 15) / 30;
    return { moyenne: N.moyenne[a] + (N.moyenne[b] - N.moyenne[a]) * f, ecartType: N.ecartType[a] + (N.ecartType[b] - N.ecartType[a]) * f };
  }
  // sécheresse de fond (0-1) au jour t, indépendante de l'espèce ; null si l'évaporation n'est pas disponible
  function secheresse(s, t) {
    if (!s.et0 || !s.et0.length || !MW.NORMALES_BILAN_90J) return { bal: null, normale: null, z: 0, sec: 0 };
    const bal = sum(s.precip, t - 89, t) - sum(s.et0, t - 89, t), n = normaleBilan(s.time[Math.min(t, s.time.length - 1)]);
    const z = (bal - n.moyenne) / n.ecartType, X = MW.SECHERESSE;
    return { bal, normale: n.moyenne, z, sec: clamp((-z - X.DEBUT_ECARTS) / (X.PLEIN_ECARTS - X.DEBUT_ECARTS), 0, 1) };
  }

  // s = { time, precip, tmean, tmin, et0 } ; t = indice du jour évalué
  function evaluate(sp, s, t) {
    const r = sp.rain;
    const rain = sum(s.precip, t - r.lag - r.window + 1, t - r.lag);
    const recent = sum(s.precip, t - r.window + 1, t);
    const P = rainIndex(r, rain);
    const last3 = sum(s.precip, t - 2, t);
    const D = sp.postRainMax ? 1 - 0.3 * clamp((last3 - sp.postRainMax) / sp.postRainMax, 0, 1) : 1;
    const Tm = mean(s.tmean, t - sp.temp.window + 1, t);
    const T = trap(Tm, sp.temp.trap);
    const dr = sum(s.precip, t - sp.drought.window + 1, t);
    const S = sp.drought.floor + (1 - sp.drought.floor) * Math.min(1, dr / sp.drought.ref);
    const tmin = minOf(s.tmin, t - 6, t);
    const f = sp.frost;
    const G = tmin >= f.thr + 2 ? 1 : tmin <= f.thr ? f.factor : f.factor + (1 - f.factor) * ((tmin - f.thr) / 2);
    const C = calendar(sp, s.time[Math.min(t, s.time.length - 1)].slice(5));
    // W réserve d'eau : bilan pluie - ET0 sur 90 jours comparé à la normale du moment (MW.NORMALES_BILAN_90J).
    // sec = 0 tant qu'on reste à moins d'un écart-type sous la normale, puis progressif jusqu'à 1 (voir MW.SECHERESSE).
    const sh = secheresse(s, t);
    const W = 1 - MW.SECHERESSE.PENALITE_MAX * sh.sec;
    return { I: P * D * T * S * G * C * W, P, D, T, S, G, C, W, bal: sh.bal, normale: sh.normale, z: sh.z, sec: sh.sec, rain, recent, Tm, tmin, dr };
  }

  function state(sp, s, t) {
    const e = evaluate(sp, s, t);
    let key, label, detail = '';
    if (e.C < 0.25) { key = 'hors'; label = 'Hors saison'; }
    else if (e.G < 0.5) { key = 'gel'; label = 'Gelé'; detail = 'Tmin ' + e.tmin.toFixed(1) + ' °C sur 7 j'; }
    else if (e.I >= 0.6) { key = 'pousse'; label = 'Pousse probable'; }
    else if (e.sec >= MW.SECHERESSE.SEUIL_GRIS) { key = 'sec'; label = 'Trop sec'; detail = 'réserve d’eau très basse : ~' + Math.round(e.normale - e.bal) + ' mm sous la normale sur 3 mois'; }
    else if (e.P < 0.6 && e.recent >= sp.rain.min && e.T >= 0.5) {
      key = 'prepare'; label = 'En préparation';
      for (let k = 1; t + k < s.time.length; k++) {
        if (evaluate(sp, s, t + k).P >= 0.6) { detail = 'sortie possible dans ~' + k + ' j'; break; }
      }
    }
    else if (e.P < 0.4) { key = 'sec'; label = 'Trop sec'; detail = 'il manque ~' + Math.max(0, Math.round(sp.rain.opt - e.rain)) + ' mm'; }
    else if (e.T < 0.5) { key = e.Tm < sp.temp.trap[1] ? 'froid' : 'chaud'; label = key === 'froid' ? 'Trop froid' : 'Trop chaud'; detail = 'moy. ' + e.Tm.toFixed(1) + ' °C'; }
    else if (e.I >= 0.35) { key = 'moyen'; label = 'Moyen'; }
    else { key = 'defav'; label = 'Défavorable'; }
    return { key, label, detail, e };
  }

  // poids du calendrier au 15 de chaque mois (frise de saison)
  function monthWeights(sp) {
    const out = [];
    for (let m = 1; m <= 12; m++) out.push(calendar(sp, (m < 10 ? '0' : '') + m + '-15'));
    return out;
  }

  MW.model = { evaluate, state, monthWeights, calendar, secheresse };
})(typeof window !== 'undefined' ? window : globalThis);
