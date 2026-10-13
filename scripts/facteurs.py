"""Données de « Pourquoi ici ? » (carte.html) : ce qui fait le potentiel d'un point, lisible dans le navigateur.

Produit (après potentiel.py, qui prépare sources/derive/) :
- data/sigles.json : pour chaque INDEX_SOL de la Carte Numérique des Sols, le sigle et sa lecture
  (texture, drainage, chimie, profondeur), selon la légende officielle (sources/docs/LCNSW_V2.pdf) ;
- data/facteurs/12/{x}/{y}.png : tuiles XYZ au zoom 12 (~25 m), R/G = INDEX_SOL (16 bits),
  B = exposition (4 bits haut : 0 plat, 1 N, 2 NE … 8 NO) + pente (4 bits bas : classes de 2,5°).
Sources publiables : CNSW (CC-BY 4.0, © SPW) et relief Copernicus. L'ancienneté des forêts n'y est PAS
(licence : pas de publication web) ; le site l'interroge en direct sur le service du SPW.

Lancer : scripts\\facteurs.bat
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from osgeo import gdal, ogr

sys.path.insert(0, os.path.dirname(__file__))
import potentiel as p  # noqa: E402
import regles_especes as R  # noqa: E402

gdal.UseExceptions()

TEXTURE = {'Z': 'sableux', 'S': 'limono-sableux', 'P': 'sablo-limoneux léger', 'L': 'sablo-limoneux', 'A': 'limoneux',
           'E': 'argileux', 'U': 'argileux lourd', 'G': 'limono-caillouteux', 'V': 'tourbeux', 'W': 'tourbière'}
DRAINAGE = {'a': 'très sec (drainage excessif)', 'b': 'bien drainé', 'c': 'drainage modéré', 'd': 'frais (drainage imparfait)',
            'h': 'humide (engorgé une partie de l’année)', 'i': 'très humide (engorgé une partie de l’année)',
            'e': 'humide (nappe en profondeur)', 'f': 'très humide (nappe proche)', 'g': 'gorgé d’eau',
            'A': 'bien drainé à frais', 'B': 'bien drainé', 'D': 'modéré à frais', 'I': 'humide à très humide',
            'F': 'humide à très humide (nappe)', 'G': 'humide à gorgé d’eau'}
SPECIALES = {'OD': 'zone décapée', 'OE': 'fosse d’extraction', 'OH': 'terril', 'OM': 'marnière', 'ON': 'remblai',
             'OT': 'terrain remanié', 'OX': 'zone bâtie ou industrielle', 'J': 'affleurement rocheux', 'J-H': 'fortes pentes et rochers',
             'H': 'complexe de fortes pentes', 'G-I': 'sols caillouteux sur forte pente', 'G-T': 'terrasses', 'R': 'ravin ou fond de vallon rocailleux',
             'S': 'fond de vallon limoneux', 'B': 'zone de source', 'B/o': 'zone de source', 'Do': 'doline', 'Ma': 'mardelle', 'N': 'sols crayeux'}


def sigles():
    """INDEX_SOL -> [sigle, texture, drainage, chimie (0 acide, 1 neutre, 2 calcaire, -1 ?), superficiel 0/1, spécial]."""
    ds = ogr.Open(p.gpkg('sols_cnsw'))
    lay = ds.ExecuteSQL('SELECT INDEX_SOL, SIGLE_PEDO, SUBSTRAT, MAT_TEXT, DRAINAGE, VAR_MAT_1, CHARGE, PHASE_1, PHASE_2, SER_SPEC, NC '
                        'FROM CNSW__SIGLES_20 GROUP BY INDEX_SOL')
    out = {}
    for f in lay:
        g = lambda k: (f.GetField(k) or '').strip()
        i = f.GetField('INDEX_SOL')
        if g('NC') == 'NC':
            out[i] = ['NC', '', '', -1, 0, 'zone non cartographiée']
            continue
        ser = g('SER_SPEC')
        if ser:
            out[i] = [g('SIGLE_PEDO'), '', '', -1, 0, SPECIALES.get(ser, 'série spéciale')]
            continue
        tex = [t for t in g('MAT_TEXT').replace('(', '').replace(')', '').split('-') if t]
        texte = ' et '.join(dict.fromkeys(TEXTURE.get(t, t) for t in tex))
        sub = ''.join(c for c in g('SUBSTRAT') if c.isalpha())
        calc = g('CHARGE') in R.CHARGE_CALCAIRE or sub in R.SUBSTRAT_CALCAIRE or g('VAR_MAT_1') == 'k'
        acide = g('CHARGE') in R.CHARGE_ACIDE or sub in R.SUBSTRAT_ACIDE
        chimie = 1 if (calc and acide) or not (calc or acide) else (2 if calc else 0)
        sup = 1 if (g('PHASE_1') in R.PHASES_SUPERFICIELLES or g('PHASE_2') in R.PHASES_SUPERFICIELLES) else 0
        out[i] = [g('SIGLE_PEDO'), texte, DRAINAGE.get(g('DRAINAGE'), ''), chimie, sup, '']
    ds.ReleaseResultSet(lay)
    return out


def raster_facteurs(w, h, te):
    out = p.fichier('facteurs_3812.tif')
    idx_ds, pente_ds, asp_ds = (gdal.Open(p.fichier(n)) for n in ('sols_index.tif', 'pente.tif', 'aspect.tif'))
    drv = gdal.GetDriverByName('GTiff')
    o = drv.Create(out, w, h, 3, gdal.GDT_Byte, options=p.CO)
    o.SetGeoTransform(idx_ds.GetGeoTransform()); o.SetProjection(idx_ds.GetProjection())
    for y0 in range(0, h, p.BLOC):
        n = min(p.BLOC, h - y0)
        idx = idx_ds.GetRasterBand(1).ReadAsArray(0, y0, w, n).astype(np.uint16)
        pente = pente_ds.GetRasterBand(1).ReadAsArray(0, y0, w, n).astype(np.float32)
        asp = asp_ds.GetRasterBand(1).ReadAsArray(0, y0, w, n).astype(np.float32)
        plat = (pente < 3) | (asp < 0)
        octant = np.where(plat, 0, (np.floor(((asp + 22.5) % 360) / 45) + 1)).astype(np.uint8)
        cl = np.clip(np.round(np.clip(pente, 0, None) / 2.5), 0, 15).astype(np.uint8)
        b = (octant << 4) | cl
        o.GetRasterBand(1).WriteArray((idx >> 8).astype(np.uint8), 0, y0)
        o.GetRasterBand(2).WriteArray((idx & 255).astype(np.uint8), 0, y0)
        o.GetRasterBand(3).WriteArray(np.where(idx > 0, b, 0).astype(np.uint8), 0, y0)
    o = None
    return out


def main():
    te, w, h = p.grille()
    os.makedirs(p.OUT, exist_ok=True)
    s = sigles()
    with open(os.path.join(p.OUT, 'sigles.json'), 'w', encoding='utf-8') as fh:
        json.dump({'v': 1, 'source': 'Carte Numérique des Sols de Wallonie, © SPW, CC-BY 4.0', 'sigles': s}, fh, ensure_ascii=False, separators=(',', ':'))
    p.log('sigles.json :', len(s), 'sigles')
    tif = raster_facteurs(w, h, te)
    vrt = p.fichier('facteurs.vrt')
    gdal.Translate(vrt, tif, format='VRT', noData=0)
    dest = os.path.join(p.OUT, 'facteurs')
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    subprocess.run([sys.executable, '-m', 'osgeo_utils.gdal2tiles', '--xyz', '-z', '12', '-r', 'near', '--exclude', '-w', 'none',
                    '--processes', str(max(1, (os.cpu_count() or 2) - 2)), vrt, dest], check=True)
    n = sum(len(f) for _, _, f in os.walk(dest))
    p.log('facteurs : %d tuiles' % n)


if __name__ == '__main__':
    main()
