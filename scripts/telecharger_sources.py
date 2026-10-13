"""Télécharge les données sources (toutes ouvertes) dans sources/<jeu>/.

Lancer via scripts\\telecharger_sources.bat (environnement Python de QGIS).
Déjà téléchargé = ignoré (reprise possible). Chaque jeu va dans son propre dossier.

Licences vérifiées le 12/10/2026 dans le catalogue Metawal du SPW :
- CNSW (sols 1:20 000), CGEOL_SIMPLE, RES_HYDRO_WAL, WALOUS 2023 : CC-BY 4.0, © SPW.
- Copernicus DEM GLO-30 : © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018,
  fourni dans le cadre du programme COPERNICUS (utilisation libre, attribution requise).
"""
import os
import sys
import zipfile

import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sources'))
SPW = 'https://geoservices.wallonie.be/geotraitement/spwdatadownload/results/'

SOURCES = {
    'sols_cnsw': [SPW + '38c2a87e-d38a-4359-9899-9d4a6b9f0c2a/CNSW_SIGLES_20_GEOPACKAGE_31370.zip'],
    'geologie': [SPW + '5bb1c85c-abe1-46b3-9af6-489ab95cd0cb/CGEOL_SIMPLE_GEOPACKAGE_31370.zip'],
    'hydro': [SPW + '407d2651-e652-4652-8767-459453155bbe/RES_HYDRO_WAL_GEOPACKAGE_3812.zip'],
    'walous2023': [SPW + '4e780ba1-463c-478e-95df-d2f1963a150d/WAL_OCS_IA__2023_GEOTIFF_3812.zip'],
    # Copernicus GLO-30 : tuiles 1° couvrant l'emprise (49.45-50.90 N, 2.80-6.50 E)
    'mnt_copernicus': [
        'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM/'
        'Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM.tif'.format(lat=lat, lon=lon)
        for lat in (49, 50) for lon in range(2, 7)
    ],
}


def download(url, dest):
    if os.path.exists(dest):
        print('  déjà là :', os.path.basename(dest))
        return
    tmp = dest + '.part'
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        total = int(r.headers.get('Content-Length') or 0)
        done = 0
        with open(tmp, 'wb') as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if total:
                    sys.stdout.write('\r  %s : %d / %d Mo' % (os.path.basename(dest), done >> 20, total >> 20))
                    sys.stdout.flush()
    os.replace(tmp, dest)
    print('\r  ok :', os.path.basename(dest), '(%d Mo)' % (os.path.getsize(dest) >> 20))


# Couches sans fichier téléchargeable, extraites du service ArcGIS (capacité « Data », pagination).
# Forêts anciennes : CGA SPW (accès libre, toute finalité) mais CGU : pas de redistribution des données
# ni de publication via un service web ; images statiques autorisées. Usage local du dérivé uniquement.
ARCGIS = {
    'forets_anciennes': ('https://geoservices.wallonie.be/arcgis/rest/services/FORET/FORETANC/MapServer/2',
                         'CLASS_CODE,ANCIENNETE'),
}


def arcgis_vers_gpkg(url, champs, dest):
    """Récupère tous les polygones d'une couche ArcGIS (EPSG:3812, géométrie simplifiée à 5 m) dans un GeoPackage."""
    import json
    import time
    from osgeo import ogr, gdal
    gdal.UseExceptions()
    if os.path.exists(dest):
        print('  déjà là :', os.path.basename(dest))
        return
    tmp = dest + '.part.gpkg'
    if os.path.exists(tmp):
        os.remove(tmp)
    n = requests.get(url + '/query', params={'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'}, timeout=120).json()['count']
    ds = None
    for off in range(0, n, 2000):
        for essai in range(4):
            try:
                r = requests.get(url + '/query', params={
                    'where': '1=1', 'outFields': champs, 'outSR': 3812, 'maxAllowableOffset': 5,
                    'orderByFields': 'OBJECTID', 'resultOffset': off, 'resultRecordCount': 2000, 'f': 'geojson'}, timeout=300)
                r.raise_for_status()
                page = r.json()
                break
            except Exception as e:  # réseau capricieux : on réessaie poliment
                print('\n  réessai (%s)' % e)
                time.sleep(10 * (essai + 1))
        else:
            sys.exit('échec du téléchargement à l\'offset %d' % off)
        src = gdal.OpenEx(json.dumps(page), gdal.OF_VECTOR)
        if ds is None:
            gdal.VectorTranslate(tmp, src, format='GPKG', layerName='couche', dstSRS='EPSG:3812', srcSRS='EPSG:3812')
        else:
            gdal.VectorTranslate(tmp, src, accessMode='append', layerName='couche', dstSRS='EPSG:3812', srcSRS='EPSG:3812')
        ds = True
        sys.stdout.write('\r  %d / %d objets' % (min(off + 2000, n), n))
        sys.stdout.flush()
        time.sleep(0.5)
    os.replace(tmp, dest)
    print('\r  ok :', os.path.basename(dest), '(%d objets)' % n)


def main():
    only = set(sys.argv[1:])
    for name, (url, champs) in ARCGIS.items():
        if only and name not in only:
            continue
        folder = os.path.join(ROOT, name)
        os.makedirs(folder, exist_ok=True)
        print('==', name)
        arcgis_vers_gpkg(url, champs, os.path.join(folder, name + '.gpkg'))
    for name, urls in SOURCES.items():
        if only and name not in only:
            continue
        folder = os.path.join(ROOT, name)
        os.makedirs(folder, exist_ok=True)
        print('==', name)
        for url in urls:
            dest = os.path.join(folder, url.rsplit('/', 1)[1])
            download(url, dest)
            if dest.endswith('.zip'):
                out = os.path.join(folder, 'extrait')
                if not os.path.isdir(out):
                    with zipfile.ZipFile(dest) as z:
                        z.extractall(out)
                    print('  extrait dans', out)


if __name__ == '__main__':
    main()
