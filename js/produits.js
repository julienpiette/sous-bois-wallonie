/* Matériel recommandé (page materiel.html).
   POUR AJOUTER TES LIENS PARTENAIRES : colle l'URL d'affiliation dans `lien` (laisser '' = bouton désactivé).
   Programmes possibles en Belgique (à vérifier / s'inscrire) : bol.com Partnerprogramma, Amazon Partenaires
   (amazon.fr / amazon.com.be), Decathlon et d'autres enseignes via Awin ou Tradedoubler.
   Les liens sont marqués rel="sponsored" et la page affiche la mention d'affiliation (obligation de transparence). */
window.PRODUITS = [
  { icone: 'couteau', nom: 'Couteau à champignons avec brosse', essentiel: true,
    pourquoi: 'Lame courbe pour couper le pied, brosse pour nettoyer sur place : la terre reste en forêt, pas dans le panier.',
    conseil: 'lame repliable ou à étui (port en poche), brosse en poils naturels.', lien: '', bouton: '' },
  { icone: 'panier', nom: 'Panier en osier ou cagette aérée', essentiel: true,
    pourquoi: 'Les champignons respirent et ne s’écrasent pas. Les spores tombent au sol pendant la marche.',
    conseil: 'jamais de sac plastique : les champignons y fermentent en quelques heures.', lien: '', bouton: '' },
  { icone: 'livre', nom: 'Guide d’identification de terrain', essentiel: true,
    pourquoi: 'Indispensable pour comparer chaque récolte avec ses sosies toxiques, photos et critères à l’appui.',
    conseil: 'un guide récent, couvrant la Belgique/France, avec les confusions dangereuses. Exemples : « Le guide des champignons France et Europe » (Eyssartier & Roux, Belin) ; « Cartes en main : meilleurs champignons comestibles » (J.-M. Polese).', lien: '', bouton: '' },
  { icone: 'loupe', nom: 'Loupe de poche x10', essentiel: false,
    pourquoi: 'Pour lire les détails qui décident d’une identification : lames, plis, pores, anneau, voile.',
    conseil: 'grossissement x10, avec cordon.', lien: '', bouton: '' },
  { icone: 'gilet', nom: 'Gilet ou bonnet orange vif', essentiel: true,
    pourquoi: 'L’automne est aussi la saison de la chasse : être vu de loin, c’est la base de la sécurité.',
    conseil: 'couleur fluo, visible de dos.', lien: '', bouton: '' },
  { icone: 'botte', nom: 'Chaussures ou bottes imperméables', essentiel: false,
    pourquoi: 'Les meilleurs coins sont souvent frais et humides : pieds au sec, journée plus longue.',
    conseil: 'semelle crantée pour les pentes.', lien: '', bouton: '' },
  { icone: 'batterie', nom: 'Batterie externe', essentiel: false,
    pourquoi: 'La carte et le GPS du téléphone vident la batterie vite, et le réseau est faible en forêt.',
    conseil: '10 000 mAh suffisent pour une journée.', lien: '', bouton: '' },
  { icone: 'boussole', nom: 'Boussole et sifflet', essentiel: false,
    pourquoi: 'On s’égare facilement tête baissée. Le sifflet porte plus loin que la voix.',
    conseil: 'un modèle léger, à garder sur soi.', lien: '', bouton: '' },
];

// pictogrammes (traits simples, couleur du texte de .produit .ico)
window.ICONES = (function () {
  const s = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  return {
    couteau: s('<path d="M4 20 15 9"/><path d="M15 9c3-3 5-4 5-6-3 0-5 2-8 5"/><path d="M6 15l3 3"/>'),
    panier: s('<path d="M3 10h18l-2 10H5L3 10z"/><path d="M7 10a5 5 0 0 1 10 0"/><path d="M9 14v3M12 14v3M15 14v3"/>'),
    livre: s('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h7"/>'),
    loupe: s('<circle cx="10" cy="10" r="6"/><path d="m20 20-5.5-5.5"/>'),
    gilet: s('<path d="M8 3 5 6v15h5v-6h4v6h5V6l-3-3-4 4-4-4z"/>'),
    botte: s('<path d="M7 3h6v10l6 3v5H5V3z"/><path d="M5 17h14"/>'),
    batterie: s('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2M7 10v4M10 10v4"/>'),
    boussole: s('<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2z"/>'),
  };
})();
