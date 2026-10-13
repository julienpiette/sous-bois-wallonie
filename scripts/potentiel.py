"""Calcule le potentiel de site par espèce et produit data/potentiel-<id>.png.

Lancer via scripts\\potentiel.bat (environnement Python/GDAL de QGIS), après scripts\\telecharger_sources.bat.
Options : --force (tout recalculer), --largeur-web N (largeur des PNG, défaut 4096 px).

Étapes (résultats intermédiaires mis en cache dans sources/derive/) :
 1. grille 25 m en Lambert 2008 (EPSG:3812) couvrant l'emprise MW.BBOX ;
 2. relief (Copernicus GLO-30) -> mnt, pente, exposition, relief lissé (pour la position topographique) ;
 3. sols CNSW -> raster de INDEX_SOL (1 index = 1 sigle) ;
 4. cours d'eau (réseau hydrographique wallon) -> distance au cours d'eau ;
 5. WALOUS 2023 -> classe d'occupation du sol dominante par pixel ;
 6. potentiel par espèce, bloc par bloc (règles : scripts/regles_especes.py) ;
 6b. étalonnage par espèce (rang parmi les pixels forestiers) : classes = quintiles, relatives ;
 7. export Web Mercator sur MW.BBOX, gris 0-255 (0 = hors habitat) -> data/ (mode météo) ;
 8. tuiles XYZ par espèce -> data/tuiles/<id>/ + data/tuiles/index.json (carte du site).
"""
import argparse
import glob
import math
import os
import re
import sys
import time

import numpy as np
from osgeo import gdal, ogr, osr

sys.path.insert(0, os.path.dirname(__file__))
import regles_especes as R  # noqa: E402

gdal.UseExceptions()
ogr.UseExceptions()

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'sources')
DER = os.path.join(SRC, 'derive')
OUT = os.path.join(ROOT, 'data')

BBOX = {'south': 49.45, 'north': 50.90, 'west': 2.80, 'east': 6.50}  # = MW.BBOX (js/config.js)
RES = 25.0
EPSG = 3812
CO = ['COMPRESS=DEFLATE', 'TILED=YES', 'BIGTIFF=IF_SAFER']
BLOC = 512  # lignes par bloc de calcul

# Classes WALOUS 2023 (valeurs du raster) -> catégorie d'hôte. Vérifiées par verifier_walous().
WALOUS_HOTE = {}  # rempli au démarrage


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def fichier(*parts):
    return os.path.join(DER, *parts)


def a_faire(path, force):
    return force or not os.path.exists(path)


# ------------------------------------------------------------------ grille
def grille():
    src = osr.SpatialReference(); src.ImportFromEPSG(4326)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(EPSG)
    ct = osr.CoordinateTransformation(src, dst)
    xs, ys = [], []
    for i in range(21):
        for lon, lat in ((BBOX['west'] + (BBOX['east'] - BBOX['west']) * i / 20, BBOX['south']),
                         (BBOX['west'] + (BBOX['east'] - BBOX['west']) * i / 20, BBOX['north']),
                         (BBOX['west'], BBOX['south'] + (BBOX['north'] - BBOX['south']) * i / 20),
                         (BBOX['east'], BBOX['south'] + (BBOX['north'] - BBOX['south']) * i / 20)):
            x, y, _ = ct.TransformPoint(lon, lat)
            xs.append(x); ys.append(y)
    x0 = math.floor(min(xs) / RES) * RES; x1 = math.ceil(max(xs) / RES) * RES
    y0 = math.floor(min(ys) / RES) * RES; y1 = math.ceil(max(ys) / RES) * RES
    return (x0, y0, x1, y1), int(round((x1 - x0) / RES)), int(round((y1 - y0) / RES))


def warp_grille(dst, src, resampling, dtype, te, **kw):
    gdal.Warp(dst, src, format='GTiff', dstSRS='EPSG:%d' % EPSG, outputBounds=te, xRes=RES, yRes=RES,
              resampleAlg=resampling, outputType=dtype, creationOptions=CO, multithread=True,
              warpMemoryLimit=512, **kw)


# ------------------------------------------------------------------ préparation
def preparer_relief(te, force):
    mnt = fichier('mnt.tif')
    tuiles = sorted(glob.glob(os.path.join(SRC, 'mnt_copernicus', '*.tif')))
    if not tuiles:
        sys.exit('Aucune tuile Copernicus dans sources/mnt_copernicus : lancer telecharger_sources.bat')
    if a_faire(mnt, force):
        log('relief : reprojection de', len(tuiles), 'tuiles Copernicus en 25 m')
        vrt = fichier('copernicus.vrt')
        gdal.BuildVRT(vrt, tuiles)
        warp_grille(mnt, vrt, 'bilinear', gdal.GDT_Float32, te, dstNodata=-9999)
    for nom, mode in (('pente.tif', 'slope'), ('aspect.tif', 'aspect')):
        if a_faire(fichier(nom), force):
            log('relief :', mode)
            gdal.DEMProcessing(fichier(nom), mnt, mode, format='GTiff', creationOptions=CO, computeEdges=True)
    lisse = fichier('mnt_lisse.tif')
    if a_faire(lisse, force):
        log('relief : lissage 500 m (position topographique)')
        gros = fichier('mnt_500m.tif')
        gdal.Warp(gros, mnt, format='GTiff', xRes=500, yRes=500, resampleAlg='average', creationOptions=CO,
                  srcNodata=-9999, dstNodata=-9999)
        warp_grille(lisse, gros, 'bilinear', gdal.GDT_Float32, te, srcNodata=-9999, dstNodata=-9999)


def gpkg(dossier):
    f = glob.glob(os.path.join(SRC, dossier, 'extrait', '**', '*.gpkg'), recursive=True)
    if not f:
        sys.exit('GeoPackage introuvable dans sources/%s : lancer telecharger_sources.bat' % dossier)
    return f[0]


def raster_vide(path, w, h, te, dtype, nodata=None):
    ds = gdal.GetDriverByName('GTiff').Create(path, w, h, 1, dtype, options=CO)
    ds.SetGeoTransform((te[0], RES, 0, te[3], 0, -RES))
    srs = osr.SpatialReference(); srs.ImportFromEPSG(EPSG)
    ds.SetProjection(srs.ExportToWkt())
    if nodata is not None:
        ds.GetRasterBand(1).SetNoDataValue(nodata)
    return ds


def preparer_sols(te, w, h, force):
    out = fichier('sols_index.tif')
    if not a_faire(out, force):
        return
    log('sols : reprojection CNSW en EPSG:3812 puis rasterisation de INDEX_SOL')
    tmp = fichier('cnsw_3812.gpkg')
    if a_faire(tmp, force):
        gdal.VectorTranslate(tmp, gpkg('sols_cnsw'), format='GPKG', dstSRS='EPSG:%d' % EPSG,
                             layers=['CNSW__SIGLES_20'], selectFields=['INDEX_SOL'], layerName='cnsw')
    ds = raster_vide(out, w, h, te, gdal.GDT_UInt16, 0)
    gdal.Rasterize(ds, tmp, layers=['cnsw'], attribute='INDEX_SOL')
    ds = None


def preparer_hydro(te, w, h, force):
    out = fichier('dist_eau.tif')
    if not a_faire(out, force):
        return
    src = gpkg('hydro')
    vds = ogr.Open(src)
    couches = [vds.GetLayer(i).GetName() for i in range(vds.GetLayerCount())]
    axes = [c for c in couches if 'AXE' in c.upper()]
    vds = None
    if not axes:
        sys.exit('Couche des axes introuvable dans %s (couches : %s)' % (src, ', '.join(couches)))
    log('hydro : rasterisation de', axes[0], 'puis distance')
    lignes = fichier('cours_eau.tif')
    ds = raster_vide(lignes, w, h, te, gdal.GDT_Byte, 0)
    gdal.Rasterize(ds, src, layers=[axes[0]], burnValues=[1], allTouched=True)
    dist = raster_vide(out, w, h, te, gdal.GDT_Float32, -1)
    gdal.ComputeProximity(ds.GetRasterBand(1), dist.GetRasterBand(1),
                          ['VALUES=1', 'DISTUNITS=GEO', 'MAXDIST=2000', 'NODATA=2000'])
    ds = dist = None


def preparer_walous(te, force):
    out = fichier('walous.tif')
    if not a_faire(out, force):
        return
    f = glob.glob(os.path.join(SRC, 'walous2023', 'extrait', '**', '*.tif'), recursive=True)
    if not f:
        sys.exit('GeoTIFF WALOUS introuvable dans sources/walous2023 : lancer telecharger_sources.bat')
    log('WALOUS : classe dominante par pixel de 25 m (', os.path.basename(f[0]), ')')
    warp_grille(out, f[0], 'mode', gdal.GDT_Byte, te, dstNodata=0)


def preparer_anciennete(te, w, h, force):
    """Classe d'ancienneté (CLASS_CODE 0-5) par pixel ; 255 = pixel absent de la couche."""
    out = fichier('anciennete.tif')
    if not a_faire(out, force):
        return
    src = os.path.join(SRC, 'forets_anciennes', 'forets_anciennes.gpkg')
    if not os.path.exists(src):
        sys.exit('Forêts anciennes absentes : lancer scripts\\telecharger_sources.bat forets_anciennes')
    log('ancienneté : rasterisation de CLASS_CODE')
    ds = raster_vide(out, w, h, te, gdal.GDT_Byte, 255)
    ds.GetRasterBand(1).Fill(255)
    gdal.Rasterize(ds, src, layers=['couche'], attribute='CLASS_CODE')
    ds = None


def preparer_acces(te, w, h, force):
    """Distance aux surfaces artificielles dominantes (WALOUS 1 revêtement, 2 bâti, 3 rail) et part d'artificiel
    dans un rayon ~500 m (zones urbaines)."""
    dist, urb = fichier('dist_artificiel.tif'), fichier('urbain.tif')
    if not (a_faire(dist, force) or a_faire(urb, force)):
        return
    log('accès : masque artificiel, distance et densité urbaine')
    wal = gdal.Open(fichier('walous.tif'))
    masque = raster_vide(fichier('artificiel.tif'), w, h, te, gdal.GDT_Byte, None)
    for y0 in range(0, h, 2048):
        n = min(2048, h - y0)
        a = wal.GetRasterBand(1).ReadAsArray(0, y0, w, n)
        masque.GetRasterBand(1).WriteArray(np.isin(a, (1, 2, 3)).astype(np.uint8) * 100, 0, y0)
    masque.FlushCache()
    d = raster_vide(dist, w, h, te, gdal.GDT_Float32, None)
    gdal.ComputeProximity(masque.GetRasterBand(1), d.GetRasterBand(1),
                          ['VALUES=100', 'DISTUNITS=GEO', 'MAXDIST=1000', 'NODATA=1000'])
    d = None
    gros = fichier('artificiel_500m.tif')
    gdal.Warp(gros, masque, format='GTiff', xRes=500, yRes=500, resampleAlg='average', outputType=gdal.GDT_Float32, creationOptions=CO)
    masque = None
    warp_grille(urb, gros, 'bilinear', gdal.GDT_Float32, te)


def verifier_walous():
    """Associe les valeurs du raster WALOUS 2023 aux catégories d'hôte, d'après la table attributaire
    (RAT) ou, à défaut, le libellé du service ArcGIS. Arrête le script si une classe forestière manque."""
    f = glob.glob(os.path.join(SRC, 'walous2023', 'extrait', '**', '*.tif'), recursive=True)[0]
    ds = gdal.Open(f)
    b = ds.GetRasterBand(1)
    noms = {}
    rat = b.GetDefaultRAT()
    if rat is not None and rat.GetRowCount():
        cols = [rat.GetNameOfCol(i) for i in range(rat.GetColumnCount())]
        cv = next((i for i, c in enumerate(cols) if c.upper() in ('VALUE', 'VALEUR')), None)
        cl = next((i for i, c in enumerate(cols) if 'CLASS' in c.upper() or 'LABEL' in c.upper() or 'NOM' in c.upper()), None)
        if cv is not None and cl is not None:
            for r in range(rat.GetRowCount()):
                noms[rat.GetValueAsInt(r, cv)] = rat.GetValueAsString(r, cl)
    if not noms and b.GetCategoryNames():
        noms = {i: n for i, n in enumerate(b.GetCategoryNames()) if n}
    qml = os.path.splitext(f)[0] + '.qml'
    if not noms and os.path.exists(qml):  # style QGIS livré avec la donnée : <paletteEntry value=".." label=".."/>
        with open(qml, encoding='utf-8') as fh:
            for v, n in re.findall(r'<paletteEntry value="(\d+)" label="([^"]*)"', fh.read()):
                noms[int(v)] = n
    if not noms:
        sys.exit('Impossible de lire les classes WALOUS (pas de RAT ni de noms de catégories) dans ' + f)
    for v, n in noms.items():
        t = n.lower()
        if 'résineux' in t or 'resineux' in t:
            WALOUS_HOTE[v] = 'jeunes' if '≤' in t or '<=' in t else 'resineux'
        elif 'feuillus' in t:
            WALOUS_HOTE[v] = 'jeunes' if '≤' in t or '<=' in t else 'feuillus'
    log('WALOUS : classes', noms)
    log('WALOUS : hôtes retenus', WALOUS_HOTE)
    if sorted(set(WALOUS_HOTE.values())) != ['feuillus', 'jeunes', 'resineux']:
        sys.exit('Classes forestières WALOUS incomplètes : vérifier la légende et adapter verifier_walous().')


# ------------------------------------------------------------------ table des sols (par INDEX_SOL)
def nettoie(s):
    return (s or '').strip()


def lettres_texture(tex):
    return [t for t in re.sub(r'[()]', '', tex).split('-') if t]


def tables_sols():
    """Pour chaque INDEX_SOL : score de sol par espèce et indice d'humidité (NaN = inconnu)."""
    ds = ogr.Open(gpkg('sols_cnsw'))
    lay = ds.ExecuteSQL('SELECT INDEX_SOL, SIGLE_PEDO, SUBSTRAT, MAT_TEXT, DRAINAGE, DEV_PROFIL, VAR_MAT_1, CHARGE, '
                        'PHASE_1, PHASE_2, SER_SPEC, NC FROM CNSW__SIGLES_20 GROUP BY INDEX_SOL')
    n = 0
    rows = []
    for f in lay:
        rows.append({k: (f.GetField(k) if k == 'INDEX_SOL' else nettoie(f.GetField(k))) for k in
                     ('INDEX_SOL', 'SIGLE_PEDO', 'SUBSTRAT', 'MAT_TEXT', 'DRAINAGE', 'DEV_PROFIL', 'VAR_MAT_1',
                      'CHARGE', 'PHASE_1', 'PHASE_2', 'SER_SPEC', 'NC')})
        n = max(n, rows[-1]['INDEX_SOL'])
    ds.ReleaseResultSet(lay)
    hum = np.full(n + 1, np.nan, np.float32)
    sols = {sp: np.full(n + 1, np.nan, np.float32) for sp in R.ESPECES}
    stats = {'nc': 0, 'special': 0, 'normal': 0}
    for r in rows:
        i = r['INDEX_SOL']
        ser = r['SER_SPEC']
        if r['NC'] == 'NC':
            stats['nc'] += 1
            continue
        if ser:
            stats['special'] += 1
            v = R.SERIES_SPECIALES.get(ser)
            if v is not None:
                for sp in R.ESPECES:
                    sols[sp][i] = v
            if ser in R.HUMIDITE_SPECIALE:
                hum[i] = R.HUMIDITE_SPECIALE[ser]
            continue
        tex = lettres_texture(r['MAT_TEXT'])
        if not tex:
            continue
        stats['normal'] += 1
        d = r['DRAINAGE']
        if d in R.HUMIDITE_DRAINAGE:
            h = R.HUMIDITE_DRAINAGE[d] + (R.DECALAGE_SABLEUX if tex[0] in ('Z', 'S', 'P') else 0)
            hum[i] = min(1.0, max(0.0, h))
        elif tex[0] in ('V', 'W'):
            hum[i] = 0.9
        sub = re.sub(r'[\d()\-/ ]', '', r['SUBSTRAT'])
        calc = r['CHARGE'] in R.CHARGE_CALCAIRE or sub in R.SUBSTRAT_CALCAIRE or r['VAR_MAT_1'] == 'k'
        acide = r['CHARGE'] in R.CHARGE_ACIDE or sub in R.SUBSTRAT_ACIDE
        chimie = 'neutre' if calc and acide else 'calcaire' if calc else 'acide' if acide else 'neutre'
        prof = R.FACTEUR_SUPERFICIEL if (r['PHASE_1'] in R.PHASES_SUPERFICIELLES or
                                         r['PHASE_2'] in R.PHASES_SUPERFICIELLES) else 1.0
        for sp, p in R.ESPECES.items():
            t = float(np.mean([p['texture'].get(x, 0.5) for x in tex]))
            s = t * p['chimie'][chimie] * prof
            if 'bonus_alluvions' in p:
                s *= p['bonus_alluvions'] if r['DEV_PROFIL'] in ('p', 'P') else p['sans_alluvions']
            sols[sp][i] = s
    log('sols : %d sigles (normaux %d, séries spéciales %d, NC %d)' % (len(rows), stats['normal'], stats['special'], stats['nc']))
    return sols, hum


# ------------------------------------------------------------------ calcul
def trapeze(x, t):
    a, b, c, d = t
    y = np.ones_like(x)
    y = np.where(x < b, np.clip((x - a) / max(b - a, 1e-6), 0, 1), y)
    y = np.where(x > c, np.clip((d - x) / max(d - c, 1e-6), 0, 1), y)
    return y


def calculer(te, w, h, force):
    sorties = {sp: fichier('potentiel_%s_3812.tif' % sp) for sp in R.ESPECES}
    if not force and all(os.path.exists(p) for p in sorties.values()):
        log('potentiel : déjà calculé (utiliser --force pour recalculer)')
        return sorties
    sols, hum_sol = tables_sols()
    hote = {sp: np.zeros(256, np.float32) for sp in R.ESPECES}
    for v, cat in WALOUS_HOTE.items():
        for sp, p in R.ESPECES.items():
            hote[sp][v] = p['hote'][cat]
    anc = {sp: np.full(256, p['anciennete']['inconnue'], np.float32) for sp, p in R.ESPECES.items()}
    for code, cle in R.ANCIENNETE_CODES.items():
        for sp, p in R.ESPECES.items():
            anc[sp][code] = p['anciennete'][cle]
    src = {k: gdal.Open(fichier(k + '.tif')) for k in ('mnt', 'mnt_lisse', 'pente', 'aspect', 'dist_eau', 'walous', 'sols_index',
                                                       'anciennete', 'dist_artificiel', 'urbain')}
    out = {sp: raster_vide(p, w, h, te, gdal.GDT_Byte, None) for sp, p in sorties.items()}
    log('potentiel : %d x %d pixels, blocs de %d lignes' % (w, h, BLOC))
    for y0 in range(0, h, BLOC):
        n = min(BLOC, h - y0)
        lit = lambda k: src[k].GetRasterBand(1).ReadAsArray(0, y0, w, n)
        walous = lit('walous')
        foret = np.isin(walous, list(WALOUS_HOTE))
        if not foret.any():
            for sp in out:
                out[sp].GetRasterBand(1).WriteArray(np.zeros((n, w), np.uint8), 0, y0)
            continue
        idx = lit('sols_index').astype(np.int32)
        idx = np.where(idx < len(hum_sol), idx, 0)
        mnt, lisse = lit('mnt').astype(np.float32), lit('mnt_lisse').astype(np.float32)
        tpi = np.where((mnt > -9000) & (lisse > -9000), mnt - lisse, 0)
        dist = lit('dist_eau').astype(np.float32)
        pente = lit('pente').astype(np.float32)
        pente = np.where(pente < 0, 0, pente)
        aspect = lit('aspect').astype(np.float32)
        topo = (np.clip(0.5 - tpi / R.TOPO_TPI_ECHELLE, 0, 1) * 0.6 + np.exp(-np.clip(dist, 0, None) / R.TOPO_DIST_ECHELLE) * 0.4)
        hs = hum_sol[idx]
        hs = np.where(np.isnan(hs), R.HUMIDITE_NEUTRE, hs)
        humid = R.PART_SOL_DANS_HUMIDITE * hs + (1 - R.PART_SOL_DANS_HUMIDITE) * topo
        plat = (pente < 3) | (aspect < 0)
        classe_anc = lit('anciennete')
        d_art = lit('dist_artificiel').astype(np.float32)
        urb = lit('urbain').astype(np.float32) / 100
        acces = np.clip((d_art - R.ACCES_DIST_MIN) / (R.ACCES_DIST_OK - R.ACCES_DIST_MIN), 0, 1)
        acces = R.ACCES_PLANCHER + (1 - R.ACCES_PLANCHER) * acces
        acces *= np.clip(1 - (urb - R.URBAIN_DEBUT) / (R.URBAIN_FIN - R.URBAIN_DEBUT), R.ACCES_PLANCHER, 1)
        for sp, p in R.ESPECES.items():
            s = sols[sp][idx]
            s = np.where(np.isnan(s), R.SOL_NEUTRE, s)
            hu = trapeze(humid, p['humidite'])
            e = p['expo']
            if e['pref'] is None or e['force'] == 0:
                ex = np.ones_like(humid)
            else:
                f = (1 + np.cos(np.radians(aspect - e['pref']))) / 2
                f = np.where(plat, 0.5, f)
                ex = (1 - e['force']) + e['force'] * f
            pe = trapeze(pente, p['pente'])
            wt = p['poids']
            tot = wt['sol'] + wt['hum'] + wt['expo'] + wt['pente'] + wt.get('anc', 0)
            v = (wt['sol'] * s + wt['hum'] * hu + wt['expo'] * ex + wt['pente'] * pe + wt.get('anc', 0) * anc[sp][classe_anc]) / tot
            v = v * hote[sp][walous] * (acces if p.get('penalite_acces', True) else 1)
            octet = np.where(foret & (hote[sp][walous] > 0), np.clip(np.round(v * 255), 1, 255), 0).astype(np.uint8)
            out[sp].GetRasterBand(1).WriteArray(octet, 0, y0)
        if (y0 // BLOC) % 4 == 0:
            log('  ligne %d / %d' % (y0 + n, h))
    for ds in out.values():
        ds.FlushCache()
    out = src = None
    return sorties


def etalonner(sorties):
    """Remplace chaque potentiel par son rang (quantile) parmi les pixels forestiers de l'espèce : l'exposition
    et la pente varient peu en Wallonie et les scores bruts sont tassés vers le haut. Les 5 classes de l'app
    deviennent des quintiles : « très bon » = les 20 % de forêts les plus favorables à l'espèce (classement
    RELATIF, l'ordre des pixels est conservé)."""
    etales = {}
    for sp, path in sorties.items():
        ds = gdal.Open(path)
        a = ds.ReadAsArray()
        foret = a > 0
        q = np.percentile(a[foret], np.linspace(0, 100, 101))
        q, i = np.unique(q, return_index=True)
        rang = np.linspace(0, 1, 101)[i]
        v = np.interp(a.astype(np.float32), q, rang)
        octet = np.where(foret, np.clip(np.round(v * 254) + 1, 1, 255), 0).astype(np.uint8)
        out = fichier('potentiel_%s_etale_3812.tif' % sp)
        o = gdal.GetDriverByName('GTiff').Create(out, ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Byte, options=CO)
        o.SetGeoTransform(ds.GetGeoTransform()); o.SetProjection(ds.GetProjection())
        o.GetRasterBand(1).WriteArray(octet)
        o = ds = None
        log('étalonnage %-9s : score brut médian %.2f, quintiles %s' % (
            sp, np.median(a[foret]) / 255, ' '.join('%.2f' % (x / 255) for x in np.percentile(a[foret], [20, 40, 60, 80]))))
        etales[sp] = out
    return etales


def exporter_web(sorties, largeur):
    os.makedirs(OUT, exist_ok=True)
    rad = math.pi / 180
    x0, x1 = 6378137 * BBOX['west'] * rad, 6378137 * BBOX['east'] * rad
    my = lambda lat: 6378137 * math.log(math.tan(math.pi / 4 + lat * rad / 2))
    y0, y1 = my(BBOX['south']), my(BBOX['north'])
    hauteur = int(round(largeur * (y1 - y0) / (x1 - x0)))
    for sp, path in sorties.items():
        tif = fichier('web_%s_3857.tif' % sp)
        gdal.Warp(tif, path, format='GTiff', dstSRS='EPSG:3857', outputBounds=(x0, y0, x1, y1),
                  width=largeur, height=hauteur, resampleAlg='average', srcNodata=0, dstNodata=0,
                  outputType=gdal.GDT_Byte, multithread=True)
        png = os.path.join(OUT, 'potentiel-%s.png' % sp)
        gdal.Translate(png, tif, format='PNG', noData='none')  # 0 reste une valeur (hors habitat), pas de transparence
        for aux in glob.glob(png + '.aux.xml'):
            os.remove(aux)
        log('web :', os.path.relpath(png, ROOT), '%dx%d' % (largeur, hauteur))


def exporter_tuiles(etales, zmin, zmax):
    """Pyramide de tuiles XYZ par espèce (data/tuiles/<id>/{z}/{x}/{y}.png, gris + alpha).
    Niveaux bas = moyenne des pixels (carte approximative dézoomée) ; zmax ~ résolution du calcul (25 m)."""
    import json
    import shutil
    import subprocess
    racine = os.path.join(OUT, 'tuiles')
    os.makedirs(racine, exist_ok=True)
    for sp, path in etales.items():
        vrt = fichier('tuiles_%s.vrt' % sp)
        gdal.Translate(vrt, path, format='VRT', noData=0)
        dest = os.path.join(racine, sp)
        if os.path.isdir(dest):
            shutil.rmtree(dest)
        log('tuiles : %s, zoom %d-%d' % (sp, zmin, zmax))
        subprocess.run([sys.executable, '-m', 'osgeo_utils.gdal2tiles', '--xyz', '-z', '%d-%d' % (zmin, zmax),
                        '-r', 'average', '--exclude', '-w', 'none', '--processes', str(max(1, (os.cpu_count() or 2) - 2)),
                        vrt, dest], check=True)
        n = sum(len(f) for _, _, f in os.walk(dest))
        log('tuiles : %s -> %d fichiers' % (sp, n))
    with open(os.path.join(racine, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'especes': list(etales), 'minZoom': zmin, 'maxZoom': zmax,
                   'date': time.strftime('%Y-%m-%d'), 'valeur': 'rang parmi les forêts wallonnes (0-255), alpha = forêt'}, fh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--largeur-web', type=int, default=4096)
    ap.add_argument('--zoom', default='7-12', help='niveaux de tuiles, ex. 7-12')
    ap.add_argument('--sans-tuiles', action='store_true')
    ap.add_argument('--recalcul', action='store_true', help='recalculer le potentiel (règles modifiées) sans refaire la préparation')
    a = ap.parse_args()
    os.makedirs(DER, exist_ok=True)
    te, w, h = grille()
    log('grille EPSG:%d 25 m : %d x %d, emprise %s' % (EPSG, w, h, te))
    verifier_walous()
    preparer_relief(te, a.force)
    preparer_sols(te, w, h, a.force)
    preparer_hydro(te, w, h, a.force)
    preparer_walous(te, a.force)
    preparer_anciennete(te, w, h, a.force)
    preparer_acces(te, w, h, a.force)
    sorties = calculer(te, w, h, a.force or a.recalcul)
    etales = etalonner(sorties)
    exporter_web(etales, a.largeur_web)  # image unique : utilisée par le mode météo
    if not a.sans_tuiles:
        zmin, zmax = (int(x) for x in a.zoom.split('-'))
        exporter_tuiles(etales, zmin, zmax)
    log('terminé')


if __name__ == '__main__':
    main()
