"""Règles du potentiel de site par espèce. TOUTES LES VALEURS SONT DES HYPOTHÈSES
(connaissances mycologiques générales), à calibrer avec le journal « Mes coins ».

Potentiel = hôte x accès x (w_sol*SOL + w_hum*HUMIDITE + w_expo*EXPOSITION + w_pente*PENTE + w_anc*ANCIENNETE) / somme(w),
chaque terme entre 0 et 1. Les poids sol/hum/expo/pente sont ceux de CLAUDE.md ; w_anc = 30 ajouté le 12/10/2026
(demande : forêts anciennes avec un poids fort), à vérifier avec scripts/valider.py (observations GBIF).
- ANCIENNETE : historique du boisement (couche « Ancienneté des forêts actuelles », SPW).
- accès : pénalité près des grandes routes / voies ferrées / bâti et en zone urbaine (pertinence et sécurité).
- hôte : 0 hors forêt (pixel transparent dans l'app), sinon facteur selon WALOUS 2023.
- SOL : texture x chimie (acide / neutre / calcaire) x profondeur, lus dans la Carte Numérique des Sols (CNSW).
- HUMIDITE : trapèze sur un indice d'humidité 0 (sec) -> 1 (engorgé) = drainage CNSW + position topographique.
- EXPOSITION : préférence d'orientation (0° = nord, 180° = sud), neutre sur terrain plat.
- PENTE : trapèze en degrés.

Lecture des sigles : « Légende de la Carte Numérique des Sols de Wallonie », v2, 2007 (sources/docs/LCNSW_V2.pdf).
"""

# ---------------------------------------------------------------- lecture CNSW (commune)

# Indice d'humidité selon la classe de drainage naturel (2e lettre du sigle), 0 = sec, 1 = engorgé.
HUMIDITE_DRAINAGE = {
    'a': 0.05, 'b': 0.25, 'c': 0.45, 'd': 0.60,   # excessif, favorable, modéré, imparfait
    'h': 0.75, 'i': 0.85,                          # assez pauvre / pauvre, engorgement temporaire
    'e': 0.80, 'f': 0.90, 'g': 1.00,               # à horizon réduit (engorgement permanent)
    'A': 0.40, 'B': 0.20, 'D': 0.55, 'I': 0.80, 'F': 0.85, 'G': 0.90,  # complexes
}
# Textures sableuses (Z, S, P) : « b » = légèrement excessif, donc plus sec.
DECALAGE_SABLEUX = -0.10

# Charge caillouteuse (CHARGE) et substrat (SUBSTRAT) indiquant un milieu calcaire / acide.
CHARGE_CALCAIRE = {'k', 'K', 'kf', 'Kf', 'Km', 'kr', 'n', 'nx', 'j'}
CHARGE_ACIDE = {'f', 'F', 'fi', 'FI', 'fp', 'fq', 'p', 'q', 'qs', 'r', 'rj', 'o', 'd', 'c', 'l'}
SUBSTRAT_CALCAIRE = {'k', 'kf', 'kfu', 'ks', 'kt', 'ku', 'i', 'iu', 'j', 'ju', 'n', 'nu', 'ln', 'c', 'm', 'mu'}
SUBSTRAT_ACIDE = {'f', 'f-r', 'fp', 'fpu', 'fu', 'p', 'pu', 'q', 'qs', 'r', 'ra', 'rb', 'ru', 's', 'd'}

# Phases de profondeur indiquant un sol superficiel (substrat < 40 cm) ; colonne PHASE_1/PHASE_2.
PHASES_SUPERFICIELLES = {'3', '4', '5', '6', '2_3', '2_4'}
FACTEUR_SUPERFICIEL = 0.75

# Séries spéciales : score de sol imposé (None = pas de sol connu -> valeur neutre).
SERIES_SPECIALES = {
    'OD': 0.0, 'OE': 0.0, 'OH': 0.05, 'OM': 0.0, 'ON': 0.0, 'OT': 0.1, 'OX': 0.0,  # sols artificiels
    'J': 0.15, 'J-H': 0.3, 'H': 0.5, 'G-I': 0.5, 'G-T': 0.4,   # rochers, fortes pentes, terrasses
    'R': 0.6, 'S': 0.8, 'B': 0.3, 'B/o': 0.1, 'Do': 0.3, 'Ma': 0.2, 'N': 0.5,
}
# Humidité imposée pour certaines séries spéciales (fonds de vallons, sources, ravins).
HUMIDITE_SPECIALE = {'S': 0.7, 'R': 0.6, 'B': 0.95, 'B/o': 0.95, 'Ma': 0.9}
SOL_NEUTRE = 0.5          # zones NC (non cartographiées) ou sigle illisible
HUMIDITE_NEUTRE = 0.45

# Humidité topographique : position dans le relief (TPI, m) et distance au cours d'eau (m).
TOPO_TPI_ECHELLE = 40.0   # TPI de -20 m (fond de vallée) -> +0.5 d'humidité
TOPO_DIST_ECHELLE = 150.0  # décroissance exponentielle de l'influence d'un cours d'eau
PART_SOL_DANS_HUMIDITE = 0.65  # le reste vient de la topographie

# ---------------------------------------------------------------- occupation du sol WALOUS 2023
# Codes de classe WALOUS 2023 (vérifiés dans la légende du service : voir potentiel.py, WALOUS_CODES).
# Facteur hôte par espèce : clés 'feuillus', 'resineux' (> 3 m) et 'jeunes' (<= 3 m).

# ---------------------------------------------------------------- ancienneté (Forêts anciennes, SPW)
# CLASS_CODE de la couche « Ancienneté des forêts actuelles » -> clé utilisée dans ESPECES[...]['anciennete'].
# Forêt ancienne = boisée sans interruption depuis la carte de Ferraris (~1775).
ANCIENNETE_CODES = {
    1: 'subnaturelle',        # forêt ancienne restée feuillue
    2: 'transfo_resineuse',   # forêt ancienne feuillue devenue résineuse
    3: 'transfo_temporaire',  # forêt ancienne passée par les résineux, redevenue feuillue
    4: 'boisement_feuillu',   # forêt feuillue récente sur terre agricole / lande
    5: 'boisement_resineux',  # plantation résineuse récente sur terre agricole / lande
}
# Pixel forestier absent de la couche (ou « déboisé ») : clé 'inconnue'.

# ---------------------------------------------------------------- accessibilité / pertinence
# Grandes routes, voies ferrées, bâti (WALOUS classes 1, 2, 3 dominantes à 25 m) : on évite les abords
# (sécurité, accès, et métaux lourds accumulés par les champignons le long des axes fréquentés).
ACCES_DIST_MIN = 30.0     # m : en dessous, facteur ACCES_PLANCHER
ACCES_DIST_OK = 120.0     # m : au-delà, facteur 1
ACCES_PLANCHER = 0.05
URBAIN_DEBUT = 0.15       # part d'artificiel dans un rayon ~500 m à partir de laquelle on pénalise
URBAIN_FIN = 0.40         # part à laquelle le facteur atteint ACCES_PLANCHER

# ---------------------------------------------------------------- espèces
ESPECES = {
    'cepe': {
        'poids': {'sol': 40, 'hum': 30, 'expo': 20, 'pente': 10, 'anc': 30},
        # épicéa = hôte classique du cèpe en Ardenne : résineux à égalité avec les feuillus (retour terrain 12/10/2026)
        'hote': {'feuillus': 1.0, 'resineux': 1.0, 'jeunes': 0.3},
        'anciennete': {'subnaturelle': 1.0, 'transfo_resineuse': 1.0, 'transfo_temporaire': 1.0,
                       'boisement_feuillu': 0.75, 'boisement_resineux': 0.85, 'inconnue': 0.7},
        'texture': {'G': 1.0, 'L': 0.9, 'A': 0.8, 'P': 0.8, 'S': 0.7, 'E': 0.5, 'Z': 0.4, 'U': 0.3, 'V': 0.1, 'W': 0.0},
        'chimie': {'acide': 1.0, 'neutre': 0.9, 'calcaire': 0.6},
        'humidite': [0.05, 0.20, 0.50, 0.75],      # trapèze [min, opt_min, opt_max, max]
        'expo': {'pref': 200, 'force': 0.3},        # plutôt chaud (S-SO)
        'pente': [-1, 0, 15, 35],
    },
    'girolle': {
        'poids': {'sol': 35, 'hum': 35, 'expo': 20, 'pente': 10, 'anc': 30},
        'hote': {'feuillus': 1.0, 'resineux': 1.0, 'jeunes': 0.3},
        'anciennete': {'subnaturelle': 1.0, 'transfo_resineuse': 1.0, 'transfo_temporaire': 1.0,
                       'boisement_feuillu': 0.75, 'boisement_resineux': 0.85, 'inconnue': 0.7},
        'texture': {'G': 1.0, 'S': 0.9, 'P': 0.9, 'L': 0.9, 'A': 0.7, 'Z': 0.6, 'E': 0.4, 'U': 0.3, 'V': 0.3, 'W': 0.1},
        'chimie': {'acide': 1.0, 'neutre': 0.7, 'calcaire': 0.3},
        'humidite': [0.15, 0.35, 0.65, 0.85],
        'expo': {'pref': 20, 'force': 0.3},         # plutôt frais (N-NE)
        'pente': [-1, 2, 20, 35],
    },
    'morille': {
        'poids': {'sol': 45, 'hum': 25, 'expo': 20, 'pente': 10, 'anc': 30},
        # Pas de pénalité d'accès : morilles souvent en milieux remaniés, près des habitations. Validé GBIF le
        # 12/10/2026 : AUC vs fond 0,41 avec pénalité -> 0,76 sans (ancienneté conservée).
        'penalite_acces': False,
        'hote': {'feuillus': 1.0, 'resineux': 0.2, 'jeunes': 0.4},
        # morilles : souvent milieux remaniés, frênaies et boisements récents plutôt que vieilles forêts
        'anciennete': {'subnaturelle': 0.8, 'transfo_resineuse': 0.4, 'transfo_temporaire': 0.8,
                       'boisement_feuillu': 1.0, 'boisement_resineux': 0.3, 'inconnue': 0.8},
        'texture': {'A': 1.0, 'L': 0.9, 'E': 0.8, 'P': 0.7, 'G': 0.7, 'S': 0.6, 'U': 0.6, 'Z': 0.3, 'V': 0.1, 'W': 0.0},
        'chimie': {'acide': 0.3, 'neutre': 0.6, 'calcaire': 1.0},
        'bonus_alluvions': 1.0, 'sans_alluvions': 0.8,   # sols sur colluvions / alluvions (développement « p »)
        'humidite': [0.25, 0.45, 0.75, 0.90],
        'expo': {'pref': 180, 'force': 0.4},        # versants qui se réchauffent tôt au printemps
        'pente': [-1, 0, 8, 20],
    },
    'trompette': {
        'poids': {'sol': 25, 'hum': 40, 'expo': 20, 'pente': 15, 'anc': 30},
        'hote': {'feuillus': 1.0, 'resineux': 0.3, 'jeunes': 0.1},
        'anciennete': {'subnaturelle': 1.0, 'transfo_resineuse': 0.5, 'transfo_temporaire': 0.85,
                       'boisement_feuillu': 0.6, 'boisement_resineux': 0.3, 'inconnue': 0.6},
        'texture': {'A': 1.0, 'E': 1.0, 'U': 0.8, 'L': 0.8, 'G': 0.8, 'P': 0.6, 'S': 0.5, 'Z': 0.3, 'V': 0.2, 'W': 0.0},
        'chimie': {'acide': 0.6, 'neutre': 1.0, 'calcaire': 0.9},
        'humidite': [0.30, 0.50, 0.80, 0.95],
        'expo': {'pref': 0, 'force': 0.4},          # versants nord, frais
        'pente': [-1, 3, 25, 40],
    },
    # Chanterelles en tube (Craterellus tubaeformis) et jaunissante (C. lutescens) : sols acides, moussus,
    # frais à humides (bords de fossés et de ruisselets, dépressions), surtout pessières, aussi hêtres/bouleaux.
    'chanterelle': {
        'poids': {'sol': 30, 'hum': 40, 'expo': 20, 'pente': 10, 'anc': 30},
        'hote': {'feuillus': 0.85, 'resineux': 1.0, 'jeunes': 0.2},
        'anciennete': {'subnaturelle': 1.0, 'transfo_resineuse': 1.0, 'transfo_temporaire': 1.0,
                       'boisement_feuillu': 0.7, 'boisement_resineux': 0.9, 'inconnue': 0.7},
        'texture': {'G': 1.0, 'S': 0.9, 'P': 0.9, 'L': 0.9, 'A': 0.8, 'Z': 0.6, 'E': 0.5, 'U': 0.4, 'V': 0.6, 'W': 0.3},
        'chimie': {'acide': 1.0, 'neutre': 0.7, 'calcaire': 0.4},
        'humidite': [0.30, 0.50, 0.85, 0.98],
        'expo': {'pref': 0, 'force': 0.3},          # versants frais
        'pente': [-1, 0, 20, 35],
    },
    'pied': {
        'poids': {'sol': 40, 'hum': 30, 'expo': 20, 'pente': 10, 'anc': 30},
        'hote': {'feuillus': 1.0, 'resineux': 0.7, 'jeunes': 0.2},
        'anciennete': {'subnaturelle': 1.0, 'transfo_resineuse': 0.8, 'transfo_temporaire': 0.9,
                       'boisement_feuillu': 0.7, 'boisement_resineux': 0.6, 'inconnue': 0.65},
        'texture': {'A': 1.0, 'E': 0.9, 'L': 0.9, 'G': 0.9, 'U': 0.7, 'P': 0.7, 'S': 0.6, 'Z': 0.4, 'V': 0.1, 'W': 0.0},
        'chimie': {'acide': 0.6, 'neutre': 1.0, 'calcaire': 1.0},
        'humidite': [0.20, 0.40, 0.70, 0.90],
        'expo': {'pref': None, 'force': 0.0},       # indifférent
        'pente': [-1, 0, 15, 30],
    },
}
