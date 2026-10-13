"""Valide les cartes de potentiel avec les observations GBIF (sources/gbif/observations.csv).

Pour chaque observation : rang moyen des forêts dans un carré de demi-côté = incertitude de localisation
(min 25 m, max 5 km), comparé aux mêmes mesures sur des emplacements forestiers tirés au hasard avec les mêmes
rayons. AUC = probabilité qu'une observation obtienne une valeur plus haute qu'un tirage au hasard
(0,5 = pas mieux que le hasard, 1 = parfait). Deux échelles : observations précises (<= 250 m) et toutes.
Les observations GBIF sont biaisées (sentiers, régions prospectées) : indicateur grossier, pas une preuve.

Lancer via scripts\\valider.bat [suffixe]  (suffixe des rasters : etale par défaut).
"""
import csv
import os
import sys

import numpy as np
from osgeo import gdal, osr

sys.path.insert(0, os.path.dirname(__file__))
import potentiel as p  # noqa: E402

gdal.UseExceptions()
PAS = 100.0  # m : résolution de travail pour les moyennes de zone


def lire_obs():
    f = os.path.join(p.SRC, 'gbif', 'observations.csv')
    if not os.path.exists(f):
        sys.exit('Lancer d\'abord scripts\\gbif.bat')
    s4326 = osr.SpatialReference(); s4326.ImportFromEPSG(4326); s4326.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    s3812 = osr.SpatialReference(); s3812.ImportFromEPSG(3812)
    ct = osr.CoordinateTransformation(s4326, s3812)
    obs = {}
    with open(f, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            u = float(r['coordinateUncertaintyInMeters']) if r['coordinateUncertaintyInMeters'] else 1000.0
            if u > 5000:
                continue
            x, y, _ = ct.TransformPoint(float(r['decimalLongitude']), float(r['decimalLatitude']))
            obs.setdefault(r['groupe'], []).append((x, y, max(u, 25.0)))
    return obs


def tables(path):
    """Rang moyen des forêts et part de forêt à 100 m, + tables cumulées (moyennes de carrés en O(1))."""
    tmp_r = p.fichier('_val_rang.tif'); tmp_f = p.fichier('_val_foret.tif')
    gdal.Warp(tmp_r, path, xRes=PAS, yRes=PAS, resampleAlg='average', srcNodata=0, dstNodata=0, outputType=gdal.GDT_Float32)
    ds = gdal.Open(path)
    a = ds.ReadAsArray()
    m = gdal.GetDriverByName('MEM').Create('', ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Byte)
    m.SetGeoTransform(ds.GetGeoTransform()); m.SetProjection(ds.GetProjection())
    m.GetRasterBand(1).WriteArray((a > 0).astype(np.uint8) * 100)
    gdal.Warp(tmp_f, m, xRes=PAS, yRes=PAS, resampleAlg='average', outputType=gdal.GDT_Float32)
    r = gdal.Open(tmp_r); gt = r.GetGeoTransform()
    rang = r.ReadAsArray().astype(np.float64) / 255
    foret = gdal.Open(tmp_f).ReadAsArray().astype(np.float64) / 100
    poids = foret
    sat = lambda z: np.pad(z.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return {'gt': gt, 'S_rv': sat(rang * poids), 'S_w': sat(poids), 'shape': rang.shape, 'pix': a, 'gt25': ds.GetGeoTransform()}


def moyenne(t, x, y, r):
    gt = t['gt']; h, w = t['shape']
    c = (x - gt[0]) / gt[1]; l = (y - gt[3]) / gt[5]; k = max(r / PAS, 0.5)
    c0, c1 = int(max(0, np.floor(c - k))), int(min(w, np.ceil(c + k)))
    l0, l1 = int(max(0, np.floor(l - k))), int(min(h, np.ceil(l + k)))
    if c1 <= c0 or l1 <= l0:
        return np.nan
    S = lambda T: T[l1, c1] - T[l0, c1] - T[l1, c0] + T[l0, c0]
    w_ = S(t['S_w'])
    return S(t['S_rv']) / w_ if w_ > 0.01 else np.nan


def point(t, x, y):
    gt = t['gt25']; a = t['pix']
    c, l = int((x - gt[0]) / gt[1]), int((y - gt[3]) / gt[5])
    if 0 <= l < a.shape[0] and 0 <= c < a.shape[1]:
        return a[l, c] / 255
    return np.nan


def auc(vo, vr):
    vo = vo[~np.isnan(vo)]; vr = vr[~np.isnan(vr)]
    if len(vo) == 0 or len(vr) == 0:
        return np.nan, 0
    vr = np.sort(vr)
    lo = np.searchsorted(vr, vo, 'left'); hi = np.searchsorted(vr, vo, 'right')
    return float(np.mean((lo + (hi - lo) / 2) / len(vr))), len(vo)


def main():
    suffixe = sys.argv[1] if len(sys.argv) > 1 else 'etale'
    obs = lire_obs()
    rng = np.random.default_rng(1)
    fond = np.array(obs.get('fond', []))
    print('AUC (0,5 = hasard, 1 = parfait) ; n = observations utilisables')
    print('« vs fond » : comparaison avec les autres champignons forestiers observés (corrige le biais d\'observation)')
    print('%-10s %-22s %-22s %-24s %-18s' % ('espèce', 'toutes (zone)', 'vs fond (zone)', 'précises <=250 m (zone)', 'précises : en forêt'))
    for sp in p.R.ESPECES:
        path = p.fichier('potentiel_%s_%s_3812.tif' % (sp, suffixe))
        if sp not in obs or not os.path.exists(path):
            continue
        t = tables(path)
        o = np.array(obs[sp])
        # emplacements forestiers au hasard (pixels 25 m), rayons tirés parmi ceux des observations
        ly, lx = np.nonzero(t['pix'] > 0)
        k = rng.choice(len(ly), 20000, replace=False)
        gt = t['gt25']
        rx = gt[0] + (lx[k] + 0.5) * gt[1]; ry = gt[3] + (ly[k] + 0.5) * gt[5]
        res = {}
        for nom, sel in (('toutes', np.ones(len(o), bool)), ('precises', o[:, 2] <= 250)):
            if not sel.any():
                res[nom] = (np.nan, 0); continue
            rr = rng.choice(o[sel, 2], len(rx))
            vo = np.array([moyenne(t, x, y, r) for x, y, r in o[sel]])
            vr = np.array([moyenne(t, x, y, r) for x, y, r in zip(rx, ry, rr)])
            res[nom] = auc(vo, vr)
            if nom == 'toutes' and len(fond):
                vf = np.array([moyenne(t, x, y, r) for x, y, r in fond])
                res['fond'] = auc(vo, vf)
        pp = np.array([point(t, x, y) for x, y, r in o[o[:, 2] <= 250]])
        en_foret = '%d/%d' % (int((pp > 0).sum()), len(pp)) if len(pp) else '-'
        rf = res.get('fond', (np.nan, 0))
        print('%-10s AUC %.2f (n=%3d)       AUC %.2f (fond n=%4d)  AUC %.2f (n=%3d)           %s' % (
            sp, res['toutes'][0], res['toutes'][1], rf[0], len(fond), res['precises'][0], res['precises'][1], en_foret))
    for f in ('_val_rang.tif', '_val_foret.tif'):
        if os.path.exists(p.fichier(f)):
            os.remove(p.fichier(f))


if __name__ == '__main__':
    main()
