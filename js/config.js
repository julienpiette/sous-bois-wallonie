/* Configuration : emprise, contour approximatif de la Wallonie, services, espèces.
   TOUS les seuils météo sont des HYPOTHÈSES issues du dossier de méthode, à calibrer
   avec le journal « Mes coins ». */
(function (root) {
  const MW = (root.MW = root.MW || {});

  MW.BBOX = { south: 49.45, north: 50.90, west: 2.80, east: 6.50 };

  // Contour SIMPLIFIÉ (lon, lat), approximatif : à remplacer par le contour officiel (SPW).
  MW.WALLONIA = [
    [2.84,50.76],[3.00,50.78],[3.25,50.81],[3.35,50.73],[3.58,50.72],[3.74,50.76],[3.95,50.72],
    [4.10,50.72],[4.25,50.77],[4.35,50.72],[4.52,50.72],[4.70,50.78],[4.90,50.78],[5.10,50.74],
    [5.30,50.73],[5.55,50.80],[5.70,50.80],[5.85,50.76],[6.00,50.76],[6.15,50.73],[6.28,50.58],
    [6.32,50.45],[6.22,50.30],[6.15,50.12],[5.98,50.08],[5.85,49.94],[5.82,49.80],[5.88,49.60],
    [5.78,49.52],[5.55,49.50],[5.35,49.52],[5.25,49.66],[5.07,49.78],[4.92,49.96],[4.85,50.12],
    [4.68,50.14],[4.50,49.98],[4.28,49.94],[4.10,50.05],[4.05,50.30],[3.85,50.34],[3.68,50.37],
    [3.62,50.48],[3.45,50.52],[3.28,50.55],[3.12,50.70],[2.92,50.72]
  ];

  // weather: false → la carte montre le potentiel de site seul (rasters data/), sans indice météo.
  // Passer à true pour réactiver le curseur de jour, l'indice météo et les pastilles d'état.
  MW.FEATURES = { weather: false };

  // Classes du potentiel de site. La valeur des tuiles = rang parmi les forêts wallonnes (0-1, voir
  // scripts/potentiel.py) : breaks [0.6, 0.8, 0.95] = les 40 %, 20 % et 5 % de forêts les plus favorables.
  // En dessous du premier seuil : non colorié (la carte de fond reste lisible).
  // tint : >0 mélange avec du blanc, <0 avec du noir.
  MW.CLASSES = {
    breaks: [0.6, 0.8, 0.95],
    labels: ['Bon', 'Très bon', 'Exceptionnel'],
    tint: [0.35, 0, -0.45]
  };

  MW.GRID = { latStep: 0.25, lonStep: 0.38, buffer: 0.3, pastDays: 80, forecastDays: 16, batchSize: 25, cacheHours: 3 };

  // Services WMS du SPW, vérifiés le 12/10/2026 : GetCapabilities + GetMap EPSG:3857, CORS ouvert.
  // layer = nom(s) WMS (ArcGIS : numéros). Plusieurs numéros = une couche par plage d'échelle,
  // le serveur affiche celle qui correspond au zoom.
  // Couches INSPIRE (geoserver/inspire_so|hy|ge) écartées : style noir par défaut, couverture partielle.
  const AGS = 'https://geoservices.wallonie.be/arcgis/services/';
  MW.SERVICES = [
    { id: 'sol',     label: 'Sols : carte numérique (CNSW, zoom ≥ 1:23 000)', url: AGS + 'SOL_SOUS_SOL/CNSW/MapServer/WMSServer', layer: '0,1,2' },
    { id: 'solTyp',  label: 'Sols : principaux types (1:250 000)',            url: AGS + 'SOL_SOUS_SOL/CNSW__PRINC_TYPES_SOLS/MapServer/WMSServer', layer: '0' },
    { id: 'geol',    label: 'Géologie simplifiée',                            url: AGS + 'SOL_SOUS_SOL/CARTE_GEOLOGIQUE_SIMPLE/MapServer/WMSServer', layer: '1,2' },
    // RHW = « donnée obsolète » selon Metawal ; remplacé par le Réseau hydrographique wallon (axes)
    { id: 'hydro',   label: 'Cours d’eau (réseau hydrographique wallon)',     url: AGS + 'EAU/RES_HYDRO_WAL_SIMPLE/MapServer/WMSServer', layer: '2' },
    { id: 'pente',   label: 'Pente % (MNP LiDAR 2013-2014)',                  url: AGS + 'RELIEF/WALLONIE_MNP_2013_2014__PENTES/MapServer/WMSServer', layer: '1' },
    { id: 'mnt',     label: 'Altitude (MNT LiDAR 2021-2022)',                 url: AGS + 'RELIEF/WALLONIE_MNT_2021_2022/MapServer/WMSServer', layer: '0' },
    { id: 'ombrage', label: 'Relief ombré (MNT 2021-2022)',                   url: AGS + 'RELIEF/WALLONIE_MNT_2021_2022_HILLSHADE/MapServer/WMSServer', layer: '0' },
    { id: 'foret',   label: 'Masque forestier 2021-2022',                     url: AGS + 'FORET/MASQUES_FORESTIERS/MapServer/WMSServer', layer: '1' }
  ];

  // rain: fenêtre de pluie (jours), décalage (jours), seuil déclencheur et optimum (mm)
  // temp: fenêtre (jours) et trapèze [min, optMin, optMax, max] sur la température moyenne
  // drought: mémoire de sécheresse (jours, pluie de référence mm, plancher du facteur)
  // frost: seuil (°C, Tmin sur 7 jours) et facteur appliqué si gel
  MW.SPECIES = [
    // cèpe : pluie cumulée sur ~26 jours et ~13 °C de moyenne sur 20 jours, quasi rien sous 10 °C
    // (suivi 2015-2024 en hêtraie allemande, bioRxiv 2025 ; repris dans l'étude du 13/10/2026)
    { id: 'cepe', name: 'Cèpes & bolets', color: '#c8782a', hosts: 'épicéas, hêtres, chênes, bouleaux, pins',
      rain: { window: 26, lag: 3, min: 40, opt: 90 }, temp: { window: 20, trap: [9, 12, 15, 19] }, postRainMax: 15,
      drought: { window: 60, ref: 130, floor: 0.45 }, frost: { thr: -2, factor: 0.15 },
      season: [['06-01','08-31',0.55],['09-01','10-31',1],['11-01','11-30',0.55]] },
    { id: 'girolle', name: 'Girolles', color: '#ff9f1c', hosts: 'hêtres, chênes, épicéas (sols acides)',
      rain: { window: 10, lag: 8, min: 20, opt: 60 }, temp: { window: 10, trap: [8, 14, 20, 25] },
      drought: { window: 60, ref: 140, floor: 0.4 }, frost: { thr: -2, factor: 0.15 },
      season: [['05-15','06-14',0.5],['06-15','10-31',1],['11-01','11-15',0.3]] },
    { id: 'morille', name: 'Morilles', color: '#4cc38a', hosts: 'frênes, lisières, sols calcaires',
      rain: { window: 14, lag: 5, min: 20, opt: 45 }, temp: { window: 7, trap: [3, 10, 16, 20] },
      drought: { window: 30, ref: 55, floor: 0.5 }, frost: { thr: -1, factor: 0.3 },
      season: [['03-10','03-31',0.6],['04-01','05-10',1],['05-11','05-31',0.4]] },
    { id: 'trompette', name: 'Trompettes de la mort', color: '#9b7fe6', hosts: 'hêtres, chênes (sols frais, humides)',
      rain: { window: 10, lag: 10, min: 20, opt: 50 }, temp: { window: 14, trap: [2, 7, 15, 19] },
      drought: { window: 60, ref: 130, floor: 0.5 }, frost: { thr: -4, factor: 0.2 },
      season: [['09-01','09-14',0.6],['09-15','11-30',1],['12-01','12-20',0.5]] },
    // Chanterelles en tube / grises (Craterellus tubaeformis) + chanterelle jaunissante (C. lutescens) :
    // tardives, supportent les premières gelées, sols acides moussus et humides, souvent sous épicéas.
    { id: 'chanterelle', name: 'Chanterelles en tube', color: '#a8a23a', hosts: 'épicéas, hêtres, bouleaux (sols acides, moussus, humides)',
      rain: { window: 10, lag: 10, min: 25, opt: 60 }, temp: { window: 14, trap: [1, 6, 14, 18] },
      drought: { window: 60, ref: 140, floor: 0.4 }, frost: { thr: -5, factor: 0.4 },
      season: [['09-01','09-30',0.5],['10-01','11-30',1],['12-01','12-31',0.6]] },
    { id: 'pied', name: 'Pieds de mouton', color: '#e8709a', hosts: 'hêtres, chênes (lisières, sols riches)',
      rain: { window: 14, lag: 12, min: 15, opt: 40 }, temp: { window: 14, trap: [2, 9, 18, 22] },
      drought: { window: 60, ref: 110, floor: 0.6 }, frost: { thr: -4, factor: 0.25 },
      season: [['08-25','09-14',0.6],['09-15','11-30',1],['12-01','12-20',0.5]] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
