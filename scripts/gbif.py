"""Récupère les observations GBIF géolocalisées en Wallonie des espèces suivies -> sources/gbif/observations.csv.
Usage : validation de la carte (scripts/valider.py), pas de redistribution. Données GBIF sous CC0 / CC-BY / CC-BY-NC
selon le jeu d'origine (colonne licence) ; citer « GBIF.org (date) » en cas de publication de résultats.
Requêtes espacées (l'API publique limite le débit). Lancer via scripts\\gbif.bat.
"""
import csv
import os
import sys
import time

import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sources', 'gbif'))
API = 'https://api.gbif.org/v1/'
UA = {'User-Agent': 'sous-bois-wallonie/0.1 (validation locale)'}
PAUSE = 2.0

# groupe cueilli -> noms scientifiques (espèce ou genre) ; les clés GBIF sont résolues par /species/match
GROUPES = {
    'cepe': ['Boletus edulis', 'Boletus aereus', 'Boletus reticulatus', 'Boletus pinophilus'],
    'girolle': ['Cantharellus cibarius', 'Cantharellus amethysteus', 'Cantharellus pallens'],
    'morille': ['Morchella'],
    'trompette': ['Craterellus cornucopioides'],
    'pied': ['Hydnum repandum', 'Hydnum rufescens'],
    'chanterelle': ['Craterellus tubaeformis', 'Craterellus lutescens'],
}
# Fond de comparaison (« target group ») : autres champignons forestiers mycorhiziens, observés par les mêmes
# personnes aux mêmes endroits -> corrige le biais d'observation (sentiers, régions prospectées) dans valider.py.
FOND = ['Russula', 'Lactarius', 'Amanita', 'Cortinarius', 'Tricholoma', 'Xerocomellus', 'Leccinum']
FOND_MAX = 1500  # observations max par genre

CHAMPS = ['groupe', 'gbifID', 'species', 'decimalLatitude', 'decimalLongitude', 'coordinateUncertaintyInMeters',
          'year', 'month', 'basisOfRecord', 'license', 'datasetKey']


def get(path, **params):
    for essai in range(5):
        r = requests.get(API + path, params=params, headers=UA, timeout=120)
        if r.status_code == 429 or 'Too many' in r.text[:200]:
            time.sleep(30 * (essai + 1))
            continue
        r.raise_for_status()
        time.sleep(PAUSE)
        return r.json()
    sys.exit('GBIF refuse les requêtes (limite de débit) : réessayer plus tard.')


def main():
    os.makedirs(ROOT, exist_ok=True)
    out = os.path.join(ROOT, 'observations.csv')
    lignes = []
    for groupe, noms in list(GROUPES.items()) + [('fond', FOND)]:
        for nom in noms:
            m = get('species/match', name=nom, kingdom='Fungi')
            cle = m.get('acceptedUsageKey') or m.get('usageKey')  # synonymes (ex. Cantharellus tubaeformis)
            if not cle or m.get('matchType') == 'NONE':
                print('  introuvable :', nom)
                continue
            off, n = 0, None
            while n is None or off < n:
                page = get('occurrence/search', taxonKey=cle, gadmGid='BEL.3_1', hasCoordinate='true',
                           hasGeospatialIssue='false', limit=300, offset=off)
                n = min(page['count'], FOND_MAX if groupe == 'fond' else 100000)
                for o in page['results']:
                    lignes.append([groupe] + [o.get(c, '') for c in CHAMPS[1:]])
                off += 300
            print('  %-9s %-28s %5d observations' % (groupe, nom, n))
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(CHAMPS)
        w.writerows(lignes)
    print('ok :', out, len(lignes), 'lignes')


if __name__ == '__main__':
    main()
