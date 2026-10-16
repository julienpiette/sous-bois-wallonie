/* Configuration : emprise, contour approximatif de la Wallonie, services, espèces. */
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

  // Classes d'affichage du potentiel de site (valeur des tuiles 0-1). En dessous de la première : non colorié.
  // tint : >0 mélange avec du blanc, <0 avec du noir.
  MW.CLASSES = {
    breaks: [0.6, 0.8, 0.95],
    labels: ['Bon', 'Très bon', 'Exceptionnel'],
    tint: [0.35, 0, -0.45]
  };

  // Sécheresse de fond : bilan pluie moins évaporation (ET0) sur les 90 jours qui précèdent, comparé à la normale du
  // moment de l'année. Normales mesurées le 16/10/2026 sur ERA5 (Open-Meteo), 2015-2025, 8 points wallons
  // (Namur, Chimay, Saint-Hubert, Spa, Arlon, Tournai, Bouillon, Marche), au 15 de chaque mois, en mm.
  MW.NORMALES_BILAN_90J = {
    moyenne:   [247, 269, 246, 130, 24, -59, -97, -106, -98, -24, 66, 169],
    ecartType: [100, 95, 90, 83, 91, 96, 111, 115, 123, 88, 75, 87]
  };
  // Pénalité progressive : rien jusqu'à 1 écart-type sous la normale (environ 1 année sur 6), pleine à 2 écarts-types
  // (environ 1 année sur 40). Elle retire au plus PENALITE_MAX du score. Grisé sur la carte et « Trop sec » au bulletin
  // seulement à partir de SEUIL_GRIS (1,5 écart-type sous la normale : les vrais cas extrêmes).
  MW.SECHERESSE = { DEBUT_ECARTS: 1.0, PLEIN_ECARTS: 2.0, PENALITE_MAX: 0.25, SEUIL_GRIS: 0.5 };

  // Petit bonus de latitude pour le potentiel de site affiché : les forêts plus au sud (Ardenne) sont en général plus
  // arrosées et plus productives. Nul au nord de LAT_SANS_BONUS, il croît linéairement jusqu'à BONUS_MAX à LAT_BONUS_MAX.
  // BONUS_MAX s'ajoute au rang du site (0-1) : 0,04 = 4 points de rang au plus, jamais dominant.
  MW.BONUS_SUD = { LAT_SANS_BONUS: 50.75, LAT_BONUS_MAX: 49.5, BONUS_MAX: 0.04 };

  MW.GRID = { latStep: 0.25, lonStep: 0.38, buffer: 0.3, pastDays: 92, forecastDays: 16, batchSize: 25, cacheHours: 3 };

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

  // famille : champignon | plante | fruit (plantes et fruits : seulement après relecture par un botaniste)
  MW.SPECIES = [
    { id: 'cepe', famille: 'champignon', name: 'Cèpes & bolets', color: '#c8782a', hosts: 'épicéas, hêtres, chênes, bouleaux, pins',
      rain: { window: 26, lag: 3, min: 40, opt: 90 }, temp: { window: 20, trap: [9, 12, 15, 19] }, postRainMax: 15,
      drought: { window: 60, ref: 130, floor: 0.45 }, frost: { thr: -2, factor: 0.15 },
      season: [['06-01','08-31',0.55],['09-01','10-31',1],['11-01','11-30',0.55]] },
    { id: 'girolle', famille: 'champignon', name: 'Girolles', color: '#ff9f1c', hosts: 'hêtres, chênes, épicéas (sols acides)',
      rain: { window: 10, lag: 8, min: 20, opt: 60 }, temp: { window: 10, trap: [8, 14, 20, 25] },
      drought: { window: 60, ref: 140, floor: 0.4 }, frost: { thr: -2, factor: 0.15 },
      season: [['05-15','06-14',0.5],['06-15','10-31',1],['11-01','11-15',0.3]] },
    { id: 'morille', famille: 'champignon', name: 'Morilles', color: '#4cc38a', hosts: 'frênes, lisières, sols calcaires',
      rain: { window: 14, lag: 5, min: 20, opt: 45 }, temp: { window: 7, trap: [3, 10, 16, 20] },
      drought: { window: 30, ref: 55, floor: 0.5 }, frost: { thr: -1, factor: 0.3 },
      season: [['03-10','03-31',0.6],['04-01','05-10',1],['05-11','05-31',0.4]] },
    { id: 'trompette', famille: 'champignon', name: 'Trompettes de la mort', color: '#9b7fe6', hosts: 'hêtres, chênes (sols frais, humides)',
      rain: { window: 10, lag: 10, min: 20, opt: 50 }, temp: { window: 14, trap: [2, 7, 15, 19] },
      drought: { window: 60, ref: 130, floor: 0.5 }, frost: { thr: -4, factor: 0.2 },
      season: [['09-01','09-14',0.6],['09-15','11-30',1],['12-01','12-20',0.5]] },
    { id: 'chanterelle', famille: 'champignon', name: 'Chanterelles en tube', color: '#a8a23a', hosts: 'épicéas, hêtres, bouleaux (sols acides, moussus, humides)',
      rain: { window: 10, lag: 10, min: 25, opt: 60 }, temp: { window: 14, trap: [1, 6, 14, 18] },
      drought: { window: 60, ref: 140, floor: 0.4 }, frost: { thr: -5, factor: 0.4 },
      season: [['09-01','09-30',0.5],['10-01','11-30',1],['12-01','12-31',0.6]] },
    { id: 'pied', famille: 'champignon', name: 'Pieds de mouton', color: '#e8709a', hosts: 'hêtres, chênes (lisières, sols riches)',
      rain: { window: 14, lag: 12, min: 15, opt: 40 }, temp: { window: 14, trap: [2, 9, 18, 22] },
      drought: { window: 60, ref: 110, floor: 0.6 }, frost: { thr: -4, factor: 0.25 },
      season: [['08-25','09-14',0.6],['09-15','11-30',1],['12-01','12-20',0.5]] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
