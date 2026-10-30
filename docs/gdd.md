# Zoo Refuge — Document de conception

Oct 25, 2026 · @Anthony

## Vision et piliers

Zoo Refuge est un tycoon de zoo mobile, calme et chaleureux : tu accueilles des animaux secourus, tu bâtis un parc où les visiteurs passent une belle journée, et chaque arrivage est une petite fête. Nom de travail, à confirmer.

**Promesse au joueur :** « Un endroit où tout va bien. Tu construis, tu observes, tu souris. »

**Public visé**

- Joueurs « cosy » de 16 à 45 ans, qui aiment collectionner, décorer et observer.
- Fans de tycoon mobile fatigués des idle games agressifs (pubs forcées, boutons « x2 » partout, timers).
- Familles : un parent et un enfant peuvent jouer ensemble sur le canapé.
- Personnes méfiantes envers l'IA : rien dans le jeu ne doit sentir le généré à la chaîne.

**Format**

- Android et iOS, en portrait, jouable à une main.
- Sessions de 3 à 10 minutes plusieurs fois par jour, et de longues sessions de construction le week-end.
- Hors ligne, sans compte obligatoire.

**Les cinq piliers**

1. **Le réconfort d'abord.** Aucun animal n'est jamais malheureux, malade ou en danger. Aucune mécanique ne punit le joueur.
2. **Un parc vivant.** Tout bouge doucement : animaux, visiteurs, météo, lumière. On peut regarder son parc sans rien faire et y prendre plaisir.
3. **La joie de l'arrivage.** Chaque tirage est une scène : un camion, une caisse, un groupe d'animaux qui découvre sa maison.
4. **Le respect du joueur.** Taux affichés, garanties visibles, tirages jamais payants, notifications jamais culpabilisantes.
5. **Fait main, imparfait, sincère.** Le jeu refuse le lisse et le parfait. Il préfère la vie : une branche de travers, un visiteur qui fait tomber sa glace, un manchot qui rate sa glissade.

**Ce que le jeu ne fera jamais**

- Pas d'énergie, pas de timers punitifs, pas de faillite.
- Pas de publicité forcée ni de pop-up d'achat au lancement.
- Pas de monnaie achetable qui donne accès à un tirage.
- Pas de compétition, de classement ou de PvP.
- Pas d'animal triste, enfermé dans une cage nue ou maltraité, même en arrière-plan.
- Pas de contenu exclusif perdu à jamais : tout événement revient.

**Références directrices**

| Référence | Ce qu'on lui prend |
| --- | --- |
| Octopath Traveler | La mise en scène : lumière chaude, profondeur, effet de maquette |
| Ulala | Les personnages : ronds, attachants, rendu façon dessin animé |
| Death Stranding | Le son : grands espaces calmes, musique rare qui arrive au bon moment |
| Tycoons mobiles isométriques | La lisibilité : on comprend son parc d'un coup d'œil |

## Boucles de jeu

Le cœur du jeu est un cercle vertueux : des visiteurs heureux rapportent des pièces, les pièces et les étoiles financent bâtiments et arrivages, et chaque nouvel enclos attire plus de visiteurs. Le jeu est semi-idle : le parc tourne seul, le joueur décide, aménage et observe.

&#91;embedded content: boucle principale · 5 étapes qui se renforcent\]

Le joueur n'agit jamais pour éviter une perte : chaque action ajoute quelque chose au cercle.

**À la minute (ce que fait le pouce)**

- Observer : zoomer sur un enclos, suivre un visiteur, lire ses bulles de pensée.
- Construire : poser une allée, un banc, un kiosque, déplacer un enclos.
- Accueillir : ouvrir un arrivage, placer le nouvel enclos.
- Aucun tap compulsif : les recettes arrivent toutes seules en caisse. Pas de pièces à ramasser une par une.

**À la session (3 à 10 minutes)**

1. Le journal du parc résume ce qui s'est passé depuis la dernière visite (recettes, visiteurs).
2. Le joueur dépense ses pièces : améliorations, services, décor.
3. Il fait un ou plusieurs tirages et installe les nouveaux venus.
4. Il règle un petit problème signalé par les visiteurs (« pas assez de bancs près des lions »).
5. Il regarde son parc, le paufine, fais un tirage, ajuste le parc en conséquence&#32;

**À la journée**

- Le courrier du refuge : un ticket d'arrivage gratuit et des nouvelles des refuges partenaires.
- Le cycle jour/nuit : certaines espèces ne s'animent que le soir.

**À la semaine**

- Un biome mis à l'honneur : ses espèces arrivent plus souvent, ses visiteurs thématiques se montrent.
- Le bilan du dimanche : avis des visiteurs, cartes postales, récompense de fidélité douce.

**Au long terme (des mois)**

- Compléter les biomes et ouvrir de nouvelles parcelles (lac, colline, forêt, rivière).
- Remplir le carnet du soigneur et les collections thématiques.
- Monter les habitats jusqu'à cinq étoiles et débloquer tous les comportements.
- Le programme de réintroduction : relâcher volontairement certains groupes vers des sanctuaires, pour l'histoire et des étoiles de conservation.
- Les saisons et fêtes annuelles qui transforment le parc.

## Le refuge : ton et récit

Le joueur reprend un vieux parc familial devenu refuge, et le transforme saison après saison en lieu de rêve pour les animaux et les visiteurs. Le récit reste léger : pas de personnages, seulement l'équipe du parc et ses animaux.

**Prémisse**

Le joueur débute avec un grand terrain, deux places de parking et une entrée dans la parc et il a un tuto pour aménager son premier enclos.

**Pas de personnages :** seulement le personnel du parc, chacun avec un prénom, un niveau et un salaire.

**D'où viennent les animaux**

Les animaux viennent uniquement des arrivages du refuge, sans bébés. Le nombre d'animaux à l'arrivée est fixe pour chaque espèce : un arrivage de lémurs catta livre toujours 6 lémurs, jamais 4 une fois puis 2 une autre. Ensuite, seuls les doublons font grandir le groupe.

**P****as**** ****d****e**** ****Moments de récit**

**Règles d'écriture**

- Phrases courtes, chaleureuses, humour doux.
- Aucune tristesse appuyée, aucune culpabilisation.
- Chaque texte relu par un humain avant intégration.
- Français et anglais au lancement, avec une vraie adaptation, pas une traduction mot à mot.

## Gacha bienveillant

Les tirages s'appellent des arrivages : chacun livre une espèce, son groupe complet et un kit d'habitat adapté, prêts à installer. Ils ne s'obtiennent qu'en jouant, jamais avec de l'argent réel, et leurs taux comme leurs garanties sont toujours affichés.

### Monnaies

| Monnaie | Comment on l'obtient | À quoi elle sert |
| --- | --- | --- |
| Pièces | Entrées et dépenses des visiteurs | Construire, améliorer, décorer, acheter des parcelles, 3 tickets par jour au guichet |
| Tickets d'arrivage | Courrier quotidien, demandes du jour, niveaux du parc, carnet, événements, guichet, pub volontaire | Faire un arrivage (10 tickets = 10 arrivages au prix de 9) |
| Médailles de soin | 10 par arrivage, plus les doublons au-delà du groupe maximum et des cinq étoiles | Choisir une espèce précise au catalogue du refuge |
| Tickets décor | Paliers de satisfaction, photos, collections | Tirages bonus de décor |
| Copeaux | Doublons de décor | Fabriquer la pièce de décor de son choix |
| Étoiles du parc | Attractivité globale, jamais dépensées | Niveaux du parc, déblocages |

### Raretés, taux et garanties

| Rareté | Taux | Garantie | Exemples |
| --- | --- | --- | --- |
| Commun | 55 % | — | Zèbre, capybara, flamant rose |
| Peu commun | 27 % | — | Fennec, paresseux, macareux |
| Rare | 12 % | Au moins un Rare tous les 10 arrivages | Panda roux, girafe, loutre géante |
| Très rare | 5 % | Garanti au 40e arrivage sans Très rare | Tigre, koala, orang-outan |
| Emblématique | 1 % | Garanti au 90e arrivage, chances en hausse dès le 70e | Panda géant, ours polaire, lamantin |

- Les compteurs sont visibles en permanence et conservés d'une bannière à l'autre.
- Variantes rares : 0,5 % de chance qu'un arrivage soit une variante naturelle (panthère noire, wallaby leucistique, renard polaire en pelage d'été). Purement esthétique, avec un bonus d'attractivité.

### Ce que contient un arrivage

- **L'espèce et son groupe social réaliste :** 6 suricates, 3 chimpanzés, 2 pandas roux, 8 flamants.
- **Un kit d'habitat de base :** sol, eau, abri et végétation du biome, déjà adaptés à l'espèce.
- **Une étiquette d'origine** et, pour une première fois, la page du carnet qui s'écrit à la main.

### Les doublons ne sont jamais perdus

1. L'arrivage donne la première étoile. Du premier au quatrième doublon, l'habitat gagne une étoile (de 2 à 5), avec un nouvel élément d'enrichissement et un nouveau comportement débloqué.
2. En parallèle, le groupe grandit d'un individu jusqu'à sa taille maximale.
3. Au-delà : chaque doublon donne 50 médailles de soin.

### Les bannières

| Bannière | Durée | Particularité |
| --- | --- | --- |
| Arrivage du refuge | Permanente | Toutes les espèces débloquées par le niveau du parc |
| Biome à l'honneur | Une semaine, en rotation | La moitié des arrivages viennent du biome mis en avant, aucune exclusivité |
| Arrivage de saison | Pendant la saison, chaque année | Espèces et variantes de saison, qui reviennent l'année suivante |
| Arrivage de bienvenue | Les 20 premiers arrivages | Un Très rare garanti, choisi parmi trois proposés |

### Le catalogue du refuge (le choix garanti)

Toute espèce déjà rencontrée peut être choisie contre des médailles : 150 pour un Rare, 400 pour un Très rare, 1 000 pour un Emblématique. Un joueur qui ne tire jamais l'animal qu'il veut finit donc toujours par l'obtenir.

### Tirages bonus de décor

- Caisses de décor par thème (lanternes, jardin japonais, bois flotté, guinguette).
- Compléter un thème débloque une version de nuit et une ambiance sonore.
- Les doublons deviennent des copeaux, et les copeaux fabriquent n'importe quelle pièce déjà vue.

### La mise en scène de l'arrivage

1. Un camion du refuge entre par le portail du parc, les visiteurs se retournent.
2. Les caisses sont déposées. La couleur des rubans et la lumière annoncent la rareté sans tricher.
3. Le joueur ouvre la caisse d'un glissement. Bruit de bois, paille, un museau qui dépasse.
4. Le groupe sort, hésite, renifle, puis découvre son enclos.
5. Première rencontre : le carnet s'ouvre et la page s'écrit. Emblématique : courte séquence et thème musical propre.
6. Dix arrivages : montage rapide, puis récapitulatif. Tout peut être passé d'un tap.

### Garde-fous éthiques

- Aucun achat ne donne de ticket ni d'accès à un tirage, directement ou indirectement.
- Pas de fausse tension : aucune animation « presque Emblématique ».
- Historique complet des arrivages consultable.
- Les taux sont affichés par principe, même sans obligation légale pour des tirages gratuits.
- Aucune notification du type « ta bannière se termine ».

## Bestiaire

La version de lancement vise 162 espèces sauvages réparties en 15 biomes et bâtiments, plus une ferme de 12 espèces et environ 45 races, et une vingtaine de variantes rares : environ 220 entrées de collection. L'objectif à long terme est de 300 espèces, à raison d'un biome ou d'une extension par saison.

La colonne « Signature » liste les traits à exagérer pour qu'on reconnaisse l'animal d'un coup d'œil, même dézoomé. Groupe = nombre d'animaux à l'arrivée ; les doublons l'agrandissent jusqu'à un maximum propre à l'espèce.

### Afrique : savane et forêts

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Zèbre des plaines | Commun | 4 | Rayures, crinière dressée en brosse |
| Gazelle de Thomson | Commun | 5 | Bande noire sur le flanc, queue qui fouette |
| Gnou bleu | Commun | 5 | Barbe, cornes en crochet, tête lourde |
| Phacochère | Commun | 3 | Défenses courbes, queue dressée en antenne quand il court |
| Suricate | Commun | 6 | Debout sur les pattes arrière, une sentinelle toujours en alerte |
| Autruche | Peu commun | 3 | Long cou nu, plumage noir et blanc |
| Lycaon | Peu commun | 5 | Grandes oreilles rondes, pelage tacheté tricolore |
| Hyène tachetée | Peu commun | 3 | Dos en pente, oreilles rondes |
| Babouin hamadryas | Peu commun | 5 | Cape argentée du mâle, museau de chien |
| Calao terrestre du Sud | Peu commun | 2 | Noir, gorge rouge vif, long bec courbe |
| Girafe réticulée | Rare | 3 | Très long cou, taches en polygones |
| Hippopotame | Rare | 3 | Énorme gueule, petites oreilles qui frétillent |
| Guépard | Rare | 2 | Silhouette fine, larmes noires sous les yeux |
| Lion d'Afrique | Très rare | 3 | Crinière ronde, houppe noire au bout de la queue |
| Rhinocéros blanc | Très rare | 2 | Deux cornes, lèvre carrée |
| Okapi | Très rare | 2 | Pattes rayées, corps brun velours |
| Gorille des plaines | Emblématique | 4 | Dos argenté, marche sur les phalanges |
| Éléphant d'Afrique | Emblématique | 3 | Immenses oreilles en éventail, défenses |

### Amérique tropicale

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Capybara | Commun | 4 | Museau carré, corps en tonneau, zen dans l'eau |
| Pécari à collier | Commun | 5 | Collier clair, groin, crête hérissée sur le dos |
| Ouistiti pygmée | Commun | 4 | Minuscule, crinière autour de la face |
| Ara macao | Peu commun | 4 | Rouge, jaune et bleu, très longue queue |
| Toucan toco | Peu commun | 3 | Bec orange géant |
| Paresseux à deux doigts | Peu commun | 2 | Suspendu tête en bas, sourire permanent |
| Tapir du Brésil | Peu commun | 2 | Petite trompe mobile, robe brun uni, croupe ronde et lourde |
| Singe-araignée | Peu commun | 5 | Membres très longs, queue enroulée aux branches |
| Tamarin-lion doré | Rare | 4 | Crinière orange vif |
| Loutre géante | Rare | 4 | Tache blanche sur la gorge, nage en bande, queue épaisse et plate |
| Fourmilier géant | Rare | 2 | Museau en tube, queue en panache |
| Jaguar | Très rare | 2 | Rosettes avec un point au centre, tête massive, longue queue tombante |

### Asie tropicale

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Loutre cendrée | Commun | 5 | Petites pattes, jongle avec des cailloux |
| Paon bleu | Commun | 4 | Roue de plumes ocellées |
| Muntjac | Commun | 3 | Petit cerf aux bois courts |
| Gibbon à mains blanches | Peu commun | 4 | Bras immenses, mains et contour du visage blancs |
| Binturong | Peu commun | 2 | Mi-ours mi-chat, queue préhensile |
| Panda roux | Rare | 2 | Masque blanc, queue annelée, pattes noires |
| Tapir de Malaisie | Rare | 2 | Robe noire à selle blanche |
| Ours malais | Rare | 2 | Croissant jaune sur la poitrine |
| Calao rhinocéros | Rare | 2 | Casque orange recourbé sur le bec |
| Panthère nébuleuse | Très rare | 2 | Taches en nuages, très longue queue |
| Tigre de Sumatra | Très rare | 2 | Rayures serrées, collerette de joues |
| Orang-outan de Bornéo | Très rare | 3 | Pelage roux, bras longs, bajoues |
| Panda géant | Emblématique | 2 | Noir et blanc, lunettes noires, bambou |

### Madagascar

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Tenrec rayé | Commun | 4 | Petit hérisson rayé jaune et noir |
| Lémur catta | Commun | 6 | Queue annelée, bain de soleil bras ouverts |
| Tortue radiée | Peu commun | 3 | Carapace bombée à étoiles jaunes |
| Vari roux | Peu commun | 4 | Pelage roux, visage noir |
| Propithèque de Verreaux | Rare | 4 | Blanc à calotte brune, se déplace en dansant de côté |
| Fossa | Rare | 1 | Puma miniature, queue aussi longue que le corps |

### Arctique

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Renne | Commun | 5 | Bois ramifiés, museau clair |
| Lièvre arctique | Commun | 4 | Blanc, oreilles bordées de noir |
| Phoque commun | Commun | 4 | Rond, tacheté, glisse sur le ventre |
| Macareux moine | Peu commun | 6 | Bec rayé orange, gris et jaune |
| Bœuf musqué | Peu commun | 4 | Laine jusqu'au sol, cornes plaquées sur le front |
| Renard polaire | Peu commun | 2 | Blanc l'hiver, brun l'été, queue énorme |
| Harfang des neiges | Rare | 2 | Chouette blanche aux yeux jaunes |
| Loup arctique | Rare | 4 | Loup blanc aux pattes larges |
| Morse | Très rare | 3 | Défenses, moustache épaisse |
| Ours polaire | Emblématique | 2 | Grand ours blanc, nez noir |

### Antarctique et côtes australes

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Manchot de Humboldt | Commun | 6 | Bande noire en fer à cheval, base du bec rose |
| Manchot pygmée | Peu commun | 6 | Tout petit, dos bleuté |
| Manchot papou | Peu commun | 6 | Bec orange, tache blanche au-dessus des yeux |
| Otarie à fourrure | Peu commun | 4 | Petites oreilles visibles, marche sur ses nageoires |
| Gorfou sauteur | Rare | 5 | Sourcils de plumes jaunes, saute de rocher en rocher |
| Manchot royal | Très rare | 4 | Taches orange vif sur le cou |
| Manchot empereur | Emblématique | 4 | Le plus grand des manchots, taches jaune orangé au cou |

### Montagnes

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Bouquetin des Alpes | Commun | 4 | Grandes cornes annelées en arc |
| Marmotte des Alpes | Commun | 5 | Debout pour siffler l'alerte |
| Yack | Peu commun | 3 | Longue robe sombre, cornes larges |
| Chèvre des montagnes Rocheuses | Peu commun | 4 | Blanche, barbiche, petites cornes noires |
| Macaque japonais | Rare | 6 | Face rouge, bain chaud l'hiver |
| Takin doré | Rare | 3 | Museau busqué, pelage doré |
| Ours à lunettes | Rare | 2 | Cercles clairs autour des yeux |
| Gypaète barbu | Très rare | 2 | Barbe noire, poitrail orangé |
| Condor des Andes | Très rare | 2 | Collerette blanche, envergure immense |
| Panthère des neiges | Emblématique | 2 | Queue épaisse enroulée, robe grise à rosettes |

### Forêt tempérée

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Renard roux | Commun | 2 | Roux, gorge et bout de queue blancs |
| Cerf élaphe | Commun | 4 | Grands bois, brame d'automne |
| Sanglier | Commun | 5 | Groin, pelage brun hérissé |
| Blaireau | Commun | 3 | Masque à bandes noires et blanches |
| Raton laveur | Commun | 4 | Masque de bandit, lave sa nourriture |
| Écureuil roux | Commun | 5 | Pinceaux d'oreilles, queue en panache |
| Hérisson d'Europe | Commun | 3 | Boule de piquants, sort le soir |
| Castor d'Europe | Peu commun | 3 | Queue plate, construit un vrai barrage |
| Lynx boréal | Peu commun | 2 | Pinceaux noirs aux oreilles, favoris |
| Chouette effraie | Peu commun | 2 | Visage blanc en forme de cœur |
| Ours brun | Rare | 2 | Bosse d'épaules, se dresse debout |
| Loup gris | Rare | 5 | Hurle en meute au crépuscule |
| Bison d'Europe | Rare | 4 | Avant massif, barbe |
| Élan | Rare | 2 | Bois en pelles, grand nez tombant |

### Prairies et steppes

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Chien de prairie | Commun | 8 | Debout sur sa butte, bisous de salutation |
| Outarde barbue | Peu commun | 3 | Parade en boule de plumes blanches |
| Antilocapre | Peu commun | 4 | Gorge à bandes blanches, cornes fourchues |
| Bison d'Amérique | Peu commun | 4 | Énorme bosse, toison laineuse |
| Cheval de Przewalski | Rare | 4 | Crinière droite, museau clair |
| Chat de Pallas | Rare | 1 | Face plate et ronde, fourrure épaisse, air grognon |
| Saïga | Très rare | 4 | Nez bulbeux en trompe |

### Déserts

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Gerboise | Commun | 6 | Sauts de kangourou, queue à pompon |
| Dromadaire | Commun | 3 | Une bosse |
| Tortue sillonnée | Peu commun | 3 | Carapace en dôme à sillons |
| Fennec | Peu commun | 3 | Oreilles géantes |
| Chameau de Bactriane | Peu commun | 3 | Deux bosses, laine d'hiver |
| Chat des sables | Rare | 2 | Oreilles larges, pattes poilues |
| Caracal | Rare | 2 | Longues oreilles noires à pinceaux |
| Oryx d'Arabie | Rare | 4 | Blanc, longues cornes droites |
| Addax | Très rare | 4 | Cornes en spirale, mèche brune sur le front |

### Australie et Océanie

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Kangourou roux | Commun | 5 | Grands bonds, queue d'appui, poche ventrale |
| Wallaby de Bennett | Commun | 5 | Petit kangourou aux joues claires |
| Émeu | Peu commun | 3 | Grand oiseau hirsute brun |
| Kookaburra | Peu commun | 2 | Gros bec, cri qui ressemble à un rire |
| Cacatoès à huppe jaune | Peu commun | 4 | Huppe jaune qui se déploie |
| Wombat commun | Rare | 2 | Bloc trapu qui creuse |
| Quokka | Rare | 5 | Sourire permanent |
| Échidné | Rare | 2 | Piquants, museau fin |
| Kiwi | Rare | 2 | Boule de plumes, long bec, sort la nuit |
| Koala | Très rare | 2 | Oreilles duveteuses, gros nez noir |
| Diable de Tasmanie | Très rare | 2 | Noir à bande blanche, bâillement spectaculaire |
| Casoar | Très rare | 1 | Casque, cou bleu et rouge |
| Ornithorynque | Emblématique | 2 | Bec de canard, queue de castor |

### Zones humides et mangroves

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Flamant rose | Commun | 8 | Rose pâle, debout sur une patte |
| Cygne noir | Commun | 2 | Noir, bec rouge |
| Martin-pêcheur | Commun | 2 | Bleu électrique, plonge |
| Pélican blanc | Peu commun | 4 | Poche sous le bec |
| Spatule rosée | Peu commun | 4 | Bec en cuillère, plumage rose |
| Loutre d'Europe | Peu commun | 3 | Nage sur le dos |
| Flamant des Caraïbes | Peu commun | 8 | Rose vif presque orange |
| Ibis rouge | Rare | 6 | Rouge écarlate |
| Grue royale | Rare | 2 | Couronne de plumes dorées |
| Alligator d'Amérique | Rare | 2 | Museau large, immobile au soleil |
| Bec-en-sabot | Très rare | 1 | Énorme bec en sabot, regard fixe |

### Océan et récifs (aquarium)

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Poisson-clown | Commun | 6 | Orange à bandes blanches, vit dans son anémone |
| Chirurgien bleu | Commun | 5 | Bleu roi, queue jaune |
| Méduse lune | Commun | 10 | Disque translucide à quatre anneaux |
| Anguille jardinière | Commun | 12 | Sort du sable comme une herbe qui ondule |
| Hippocampe | Peu commun | 4 | Nage debout, queue enroulée |
| Poisson-ballon | Peu commun | 3 | Se gonfle en boule |
| Raie pastenague | Peu commun | 3 | Disque plat qui ondule |
| Tortue verte | Rare | 2 | Nage lente, carapace à écailles |
| Poulpe géant du Pacifique | Rare | 1 | Change de couleur, ouvre des bocaux |
| Requin-zèbre | Rare | 2 | Taches léopard, repose au fond |
| Dragon de mer feuillu | Très rare | 3 | Ressemble à une algue qui dérive |
| Loutre de mer | Très rare | 3 | Flotte sur le dos, se tient la patte en dormant |
| Lamantin des Caraïbes | Emblématique | 2 | Grosse vache marine paisible |
| Requin-baleine | Emblématique | 1 | Immense, ponctué de taches blanches |

### Vivarium et serre

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Phasme | Commun | 10 | Brindille qui marche |
| Gecko léopard | Commun | 3 | Tacheté, sourire |
| Morpho bleu | Commun | 10 | Ailes bleu métallique, dans la serre à papillons |
| Iguane vert | Commun | 2 | Crête dorsale, fanon |
| Axolotl | Peu commun | 4 | Branchies plumeuses, sourire |
| Dendrobate azuré | Peu commun | 5 | Bleu électrique tacheté de noir |
| Rainette aux yeux rouges | Peu commun | 4 | Yeux rouges, flancs bleus |
| Python royal | Peu commun | 1 | S'enroule en boule |
| Fourmis coupe-feuille | Peu commun | Colonie | Procession de morceaux de feuilles |
| Caméléon panthère | Rare | 1 | Yeux indépendants, couleurs changeantes |
| Tortue géante d'Aldabra | Très rare | 2 | Énorme, d'une lenteur majestueuse |
| Varan de Komodo | Emblématique | 1 | Plus grand lézard du monde, langue fourchue |

### Nocturama

| Espèce | Rareté | Groupe | Signature |
| --- | --- | --- | --- |
| Roussette | Commun | 12 | Suspendue, enroulée dans ses ailes |
| Galago | Peu commun | 3 | Grands yeux, sauts en ressort |
| Kinkajou | Peu commun | 2 | Queue préhensile, longue langue |
| Loris lent | Rare | 2 | Yeux immenses, gestes au ralenti |
| Tarsier | Rare | 2 | Yeux énormes, tête qui pivote |
| Aye-aye | Très rare | 2 | Doigt maigre qui tapote le bois, grandes oreilles |

### Ferme du refuge

La ferme est un biome à part où les races comptent : chaque race est une entrée de collection, avec sa rareté propre.

| Espèce | Races à collectionner | Raretés |
| --- | --- | --- |
| Poule | Soie, Brahma, Marans, Pékin, Padoue | Commun à Rare |
| Lapin | Bélier, Angora, Tête de lion, Rex, Géant des Flandres | Commun à Rare |
| Chèvre | Naine, Alpine, Angora, Boer, Poitevine | Commun à Rare |
| Mouton | Ouessant, Mérinos, Jacob à quatre cornes, Valais à nez noir | Commun à Très rare |
| Cochon | Vietnamien, Kunekune, Mangalica laineux, Cul noir du Limousin | Commun à Rare |
| Âne | Âne de Provence, Grand noir du Berry, Baudet du Poitou | Peu commun à Très rare |
| Vache | Highland, Normande, Jersiaise, Dexter | Peu commun à Rare |
| Cheval | Shetland, Falabella, Comtois, Percheron, Trait du Nord | Peu commun à Rare |
| Alpaga | Huacaya, Suri | Peu commun à Rare |
| Canard | Coureur indien, Cayuga, Canard mandarin | Commun à Peu commun |
| Oie | Oie de Toulouse, Oie cygnoïde | Commun |
| Dindon | Dindon noir, Dindon bronzé | Commun |

### Variantes rares

- Variantes naturelles documentées : panthère noire (jaguar mélanique), girafe leucistique, wallaby leucistique, axolotl leucistique, renard polaire « bleu », manchot leucistique, ours brun clair, zèbre aux rayures irrégulières.
- Pelages saisonniers : renard polaire et lièvre arctique changent de robe selon la saison réelle.
- **Règle éthique :** aucune variante issue d'un élevage abusif (tigre blanc consanguin, ligre, croisements). C'est un choix assumé et expliqué dans le carnet.

### Espèces sensibles

Araignées et serpents sont présents mais masquables : un réglage les remplace par une silhouette stylisée pour les joueurs phobiques. Aucune espèce dont la captivité est largement critiquée (dauphins, orques) n'entre dans le jeu.

## Enclos et habitats

Chaque arrivage livre un habitat de base déjà adapté, que le joueur place puis embellit librement. Les habitats montent de une à cinq étoiles, et chaque étoile ajoute un élément d'enrichissement qui débloque un nouveau comportement visible.

**Tailles d'enclos**

| Taille | Emprise | Pour qui |
| --- | --- | --- |
| S | 4 × 4 cases | Suricates, fennecs, loutres, lémurs |
| M | 6 × 6 | Pandas roux, guépards, manchots, kangourous |
| L | 8 × 8 | Lions, girafes, ours, zèbres |
| XL | 12 × 12 | Éléphants, rhinocéros, plaines partagées |
| Bassin | Variable | Phoques, loutres de mer, hippopotames, lamantins |
| Intérieur | Bâtiment | Aquarium, vivarium, nocturama, serre à papillons, volière |

La forme est libre : le joueur trace le contour, la taille fixe seulement la surface minimale. Un enclos plus grand que le minimum gagne de l'attractivité.

**Les composants d'un habitat**

- **Sol :** herbe, sable, neige, roche, boue, copeaux, litière forestière.
- **Eau :** mare, bassin profond, rivière, cascade, banquise, bain chaud.
- **Végétation :** propre à chaque biome, avec des variantes saisonnières.
- **Abris :** grottes, terriers, cabanes, troncs creux, nichoirs.
- **Enrichissement :** cordes, plateformes, troncs à griffer, rochers chauffants, mangeoires puzzle, ballons, glace aux fruits, bains de boue, arbres à grimper, toboggan pour manchots.
- **Barrières :** bois, vitre, fossé discret, filet de volière, murets de pierre.
- **Points de vue visiteurs :** vitre panoramique, passerelle surélevée, tunnel sous-marin, ponton, belévèdère, cabane d'observation.

**Les cinq étoiles d'un habitat**

| Étoiles | Ce qui s'ajoute | Exemple pour les loutres |
| --- | --- | --- |
| 1 | Kit de base de l'arrivage | Mare, rochers, terrier |
| 2 | Premier jouet d'enrichissement | Cailloux à jongler |
| 3 | Élément d'eau ou de relief | Petite cascade et toboggan |
| 4 | Abri de prestige et point de vue | Terrier vitré vu par les visiteurs |
| 5 | Élément signature de l'espèce | Radeau flottant où elles dorment en se tenant la patte |

Les étoiles se gagnent par doublons ou par amélioration en pièces, plus lente mais toujours possible.

**Enclos partagés**

Certaines espèces compatibles peuvent vivre ensemble, avec un bonus d'attractivité et des interactions inédites :

- Plaine africaine : zèbres, girafes, autruches, gnous.
- Forêt malgache : lémurs catta, tortues radiées.
- Pampa : capybaras, tapirs du Brésil, pécaris.
- Grande volière tropicale : aras, toucans, paresseux.
- Plaine australienne : kangourous, émeus, wallabies.

Une table de compatibilité interne empêche les associations absurdes (prédateurs et proies) sans jamais afficher de message négatif : l'option n'est simplement pas proposée.

**Pas de jauge de souffrance**

Les animaux sont toujours heureux. À la place d'une jauge de bien-être, chaque enclos affiche un **épanouissement** : la liste des comportements déjà débloqués et ceux qu'un nouvel élément pourrait révéler. C'est une invitation, jamais un reproche.

**Qualité de vue**

Chaque enclos a une note de vue, calculée à partir des points d'observation, de la distance et des obstacles. Une bonne vue fait rester les visiteurs plus longtemps et déclenche plus de photos et de moments.

**Quartiers de biome**

Trois enclos du même biome côte à côte forment un quartier : allées, panneaux, végétation et ambiance sonore s'harmonisent automatiquement, avec un bonus d'attractivité.

## Vie animale : comportements et mouvements

Les animaux bougent beaucoup mais lentement : chaque espèce a 12 à 20 comportements, enchaînés par une petite intelligence de routine, et jamais deux enclos ne se ressemblent à la même minute. La règle d'or : du mouvement permanent, presque jamais de vitesse.

### Principes de mouvement

- **Calme par défaut :** marche, nage, flottement, toilettage. La course n'existe qu'en courts éclats joyeux (jeu, arrivage, nourrissage).
- **Respiration partout :** même immobile, un animal respire, cligne des yeux, bouge une oreille ou la queue.
- **Décalage naturel :** deux individus ne font jamais le même geste en même temps. Chaque animal a sa vitesse et son rythme légèrement différents.
- **Imperfection voulue :** un lémur rate sa prise et se rattrape, un manchot trébuche avant de plonger, un jeune ours tombe en jouant.
- **Lisibilité :** chaque comportement se comprend en une seconde, même dézoomé.

### Familles d'animation

Les espèces partagent des squelettes par famille, puis reçoivent leurs comportements signatures. Seize familles couvrent tout le bestiaire.

| Famille | Espèces | Comportements partagés |
| --- | --- | --- |
| Félins | Lions, tigres, guépards, lynx, chats | S'étirer, se lécher, s'allonger au soleil, griffer un tronc, jouer à la balle |
| Canidés et hyènes | Loups, renards, lycaons, fennecs | Trotter, renifler le sol, hurler, jouer à se poursuivre |
| Ours | Brun, polaire, malais, panda | Se dresser, se gratter le dos contre un arbre, nager, rouler sur le dos |
| Ongulés | Zèbres, girafes, cerfs, bisons | Brouter, boire, chasser les mouches, se rouler dans la poussière |
| Grands primates | Gorilles, orangs-outans | S'asseoir, observer les visiteurs, construire un nid de feuilles, s'épouiller |
| Petits primates | Lémurs, gibbons, tamarins | Grimper, se balancer, bain de soleil, épouillage en chaîne |
| Éléphantidés | Éléphants | Douche à la trompe, bain de boue, jouer avec un pneu, se saluer trompe contre trompe |
| Rongeurs et petits mammifères | Suricates, capybaras, marmottes, chiens de prairie | Sentinelle, creuser, grignoter, s'empiler pour dormir |
| Marsupiaux | Kangourous, koalas, wombats | Bondir, s'asseoir sur la queue, dormir dans l'arbre, creuser |
| Pinnipèdes et loutres | Phoques, otaries, loutres | Glisser, plonger, flotter sur le dos, jongler |
| Manchots | Toutes espèces | Se dandiner, glisser sur le ventre, plonger, battre des ailerons |
| Oiseaux marcheurs | Flamants, autruches, grues | Se tenir sur une patte, parader, lisser ses plumes |
| Oiseaux volants | Aras, toucans, rapaces | Voler en volière, se percher, s'ébrouer |
| Reptiles et amphibiens | Tortues, varans, caméléons, axolotls | Se chauffer, ramper lentement, changer de couleur |
| Poissons et invertébrés | Poissons, méduses, poulpes | Bancs, dérive, camouflage, cacher et sortir |
| Insectes | Papillons, phasmes, fourmis | Envol en nuée, procession, immobilité |

### Catalogue type d'une espèce (exemple : le panda roux)

1. Respirer, cligner, remuer la queue (permanent).
2. Marcher sur le sol, marcher sur une branche.
3. Grimper et descendre d'un tronc.
4. Manger des pousses de bambou assis.
5. Boire à la mare.
6. Se toiletter le visage avec les pattes.
7. Dormir en boule, la queue sur le nez.
8. Dormir étalé sur une branche par temps chaud.
9. Se dresser sur les pattes arrière, bras levés (signature).
10. Jouer à se poursuivre avec un congénère.
11. Toilettage mutuel.
12. Observer un visiteur curieux à travers la vitre.
13. Secouer la neige de sa fourrure.
14. Courte course joyeuse au nourrissage.
15. Jouer avec l'enrichissement de l'habitat (selon les étoiles).

### Routines de la journée

| Moment | Ce qui se passe |
| --- | --- |
| Aube | Réveil progressif, étirements, les nocturnes rentrent |
| Matin | Premier nourrissage public, activité maximale, jeux |
| Midi | Sieste à l'ombre, bain pour ceux qui aiment l'eau |
| Après-midi | Toilettage, enrichissement, curiosité envers les visiteurs |
| Coucher du soleil | Hurlements des loups, regroupements, dernier repas |
| Nuit | Les nocturnes s'animent, les autres dorment en tas |

### Interactions

- **Dans le groupe :** jeu, toilettage, câlins, petites chamailleries sans violence.
- **Entre espèces d'un enclos partagé :** une girafe qui se penche vers une autruche, des lémurs qui s'assoient sur une tortue.
- **Avec les visiteurs :** un orang-outan qui imite un enfant, une loutre qui suit un doigt sur la vitre, un manchot qui suit un ballon des yeux.
- **Avec les soigneurs :** nourrissages publics, distribution de jouets, examens doux montrés comme un moment de confiance.

### Météo et saisons

- Pluie : les primates s'abritent, les canards et hippopotames s'en réjouissent, les animaux s'ébrouent après.
- Neige : les ours polaires et pandas roulent dedans, les espèces tropicales restent dans leur abri chauffé.
- Canicule douce : bains, ombre, glace aux fruits distribuée.
- Automne : le brame des cerfs, les écureuils qui cachent des noisettes.

### Moments rares

Une fois par jour environ, un moment rare se déclenche quelque part dans le parc. Exemples :

- deux loutres de mer qui s'endorment en se tenant la patte ;
- un panda géant qui roule dans la pente ;
- toute une colonie de suricates qui se dresse en même temps ;
- un éléphant qui s'arrose et glisse dans la boue ;
- un flamant qui s'endort et perd l'équilibre ;
- les loups qui hurlent sous la pleine lune réelle.

### Reconnaissance au premier coup d'œil

Tu l'as demandé après le diorama : chaque animal doit être identifiable sans lire son nom.

1. **La silhouette d'abord :** reconnaissable en ombre noire de 48 pixels. Test obligatoire avant intégration.
2. **Trois traits signatures exagérés** par espèce (colonne Signature du bestiaire) : cou de girafe plus long, oreilles du fennec plus grandes, masque du panda roux plus contrasté.
3. **Couleurs fidèles à la réalité**, simplifiées mais jamais inventées.
4. **Proportions mignonnes, pas déformées :** tête un peu plus grosse, mais les rapports qui définissent l'espèce sont conservés.
5. **Pose signature au repos :** flamant sur une patte, suricate debout, paresseux suspendu, lémur en bain de soleil.
6. **Un niveau de détail à distance qui garde les signatures :** le modèle simplifié conserve rayures, masque, crinière.
7. **Test utilisateur :** 10 personnes, 20 silhouettes. Objectif : plus de 90 % de bonnes réponses.

## Visiteurs

Le bien-être des visiteurs est le moteur du tycoon : leur satisfaction fixe la durée de visite, les dépenses et le bouche-à-oreille. Chaque visiteur est généré à partir de pièces faites à la main, assez variées pour qu'on ne voie jamais deux fois la même personne dans une même minute.

### Archétypes

| Archétype | Ce qui le rend unique | Ce qu'il veut |
| --- | --- | --- |
| Famille avec poussette | Parent qui pousse, bébé qui tend les bras | Allées larges, toilettes avec table à langer, ombre |
| Parent et enfant sur les épaules | L'enfant fait coucou aux animaux | Points de vue, glaces |
| Fratrie turbulente | Courent vers chaque vitre | Aire de jeux, animaux actifs |
| Couple | Se tiennent la main, s'assoient longtemps | Bancs avec vue, café, coucher de soleil |
| Ado photographe | Appareil ou téléphone, casquette | Moments rares, belles vues |
| Sortie scolaire | Une enseignante et 12 enfants en file | Centre pédagogique, nourrissages publics |
| Retraités | Chapeau, lunettes, marche lente | Bancs fréquents, calme, salon de thé |
| Passionnée d'oiseaux | Jumelles, carnet | Volière, zones humides |
| Dessinateur | S'installe des heures avec un carnet de croquis | Bancs face aux animaux calmes |
| Touristes | Carte dépliée, sac à dos | Panneaux, boutique de souvenirs |
| Grand-parent et petit-enfant | Main dans la main | Ferme du refuge, animaux familiers |
| Visiteur en fauteuil roulant | Présence normale et fréquente | Allées sans marches, vitres basses |
| Anniversaire d'enfant | Couronne en carton, ballons, groupe d'amis | Pique-nique, gâteau au café |
| Jeunes amis | Rient, partagent une gaufre | Restauration, animaux drôles |

### Génération des visiteurs

- Âges : enfant, ado, adulte, senior.
- Silhouettes : plusieurs tailles et corpulences, pas un seul gabarit.
- Teintes de peau et couleurs de cheveux variées, coiffures nombreuses : courte, carré, chignon, queue de cheval, tresses, boucles, calvitie, barbe.
- Tenues selon la saison réelle : manteau et bonnet l'hiver, short et casquette l'été, ciré sous la pluie.
- Plus de 30 accessoires : sac à dos, appareil photo, jumelles, ballon, glace, peluche du parc, parapluie, lunettes, écharpe, canne, porte-bébé.
- **Pas trop parfait :** tenues légèrement dépareillées, lacet défait, casquette de travers.

### Besoins et satisfaction

| Besoin | Ce qui le satisfait |
| --- | --- |
| Émerveillement | Variété d'espèces, qualité de vue, moments rares |
| Faim et soif | Kiosques, restaurants, fontaines à portée de marche |
| Repos | Bancs, ombre, pelouses, abris |
| Confort | Toilettes, poubelles, propreté, abris contre la pluie |
| Amusement | Aires de jeux, petit train, nourrissages publics, boutiques |
| Orientation | Panneaux, plan du parc, allées lisibles |

La satisfaction est une moyenne lissée qu'on peut consulter par zone. Une baisse ne punit jamais : elle réduit seulement un peu les dépenses et la fréquentation, et les visiteurs disent clairement pourquoi.

### Bulles de pensée et livre d'or

- Un tap sur un visiteur affiche sa bulle : « Les loutres se tiennent la patte, regarde ! », « Il me faudrait un banc par ici. »
- Les remarques utiles sont regroupées dans un fil de suggestions, classées par fréquence.
- Le livre d'or rassemble les meilleurs avis et dessins d'enfants, écrits à la main par l'équipe à partir de modèles.

### Micro-moments de visiteurs

1. Un enfant colle son visage contre la vitre, l'orang-outan s'approche.
2. Un papa porte sa fille sur les épaules pour qu'elle voie les girafes.
3. Un enfant fait tomber sa glace, le parent lui en rachète une, il sourit à nouveau.
4. Un couple s'assoit au coucher du soleil face au lac.
5. Une averse : les parapluies s'ouvrent, des gens courent s'abriter en riant.
6. Le ballon d'une fillette lui échappe et s'envole au-dessus du parc.
7. Une classe applaudit au nourrissage des manchots.
8. Un dessinateur montre son croquis à un passant.
9. Une grand-mère donne le bras à son petit-fils sur la passerelle.
10. Un ado s'accroupit pour photographier un suricate à sa hauteur.
11. Des enfants imitent la démarche des manchots.
12. Quelqu'un achète une peluche de l'animal préféré de son enfant à la boutique.

### Déplacements et foule

- Les visiteurs suivent les allées, s'arrêtent aux points de vue, cherchent les services quand un besoin monte.
- Jamais de bouchon bloquant : la densité est régulée et les files d'attente restent courtes et vivantes.
- Jusqu'à 250 visiteurs animés à l'écran, avec des versions simplifiées au loin.

### Visiteurs spéciaux

- **Photographe animalier :** demande une photo précise, offre des tickets décor.
- **Rédactrice de guide touristique :** vient une fois par saison et attribue des étoiles au parc.
- **Classe d'école :** propose une petite quête pédagogique.
- **Ancien soigneur :** raconte une anecdote sur une espèce et débloque une page du carnet.

## Aménagement et gestion du parc

Construire doit être aussi agréable que regarder : placement à un doigt, déplacement gratuit, annulation illimitée, et une gestion volontairement légère qui ne transforme jamais le jeu en tableur.

### Construire

- Grille invisible avec aimantation douce, rotation par quart de tour ou libre.
- Allées tracées au doigt, avec courbes automatiques et revêtements au choix (gravier, bois, pavés, terre battue).
- Déplacer un élément est toujours gratuit, animaux compris : ils suivent leur enclos sans stress.
- Annuler et rétablir sans limite pendant la session.
- Modèles enregistrables : un coin repas parfait se copie ailleurs.
- Mode « plan » vu de dessus pour les grands réaménagements.

### Services et attractions

| Catégorie | Éléments |
| --- | --- |
| Restauration | Kiosque à glaces, gaufres, crêpes, pop-corn, fontaine à eau, café, salon de thé, restaurant panoramique, aire de pique-nique |
| Confort | Bancs, toilettes, poubelles, abris, pergolas, brumisateurs, parasols |
| Boutiques | Peluches des animaux du parc, cartes postales, livres, graines à planter |
| Attractions calmes | Petit train, barque sur le lac, téléphérique au-dessus de la savane, kiosque à musique, aire de jeux en bois |
| Découverte | Centre pédagogique, clinique vétérinaire vitrée, cabane d'observation, tunnel aquarium |
| Soigneurs | Cuisine des animaux, local à jouets, maison des soigneurs |

### Personnel

- Soigneurs, jardiniers, agents d'entretien, animateurs et vendeurs sont visibles et vivants dans le parc.
- Chaque employé a un prénom, un niveau et un salaire. Le niveau monte avec l'expérience et améliore son travail : nourrissages plus suivis, allées plus propres, ventes plus chaleureuses.
- Le salaire suit le niveau automatiquement : pas de négociation de salaire.
- Pas de grosse gestion du personnel : le joueur embauche, choisit la zone de chacun et suit sa progression, rien de plus.
- Les animateurs organisent des nourrissages publics à heures fixes, qui attirent la foule.

### Économie du parc

- Prix d'entrée réglable avec un curseur : trop cher, moins de visiteurs mais plus de recettes par tête. Le jeu montre l'effet estimé avant validation.
- Prix des services réglables par type, avec un réglage « juste » recommandé.
- Entretien et salaires légers, déduits automatiquement.
- **Pas de faillite :** le parc ne descend jamais sous un plancher de recettes. Rien ne se dégrade si le joueur s'absente.

### Le terrain

- Le parc commence sur un immense terrain à développer, comme dans les tycoons mobiles. Il s'agrandit ensuite par achat de parcelles voisines (pièces et niveau de parc).
- Parcelles variées : lac, colline, forêt existante, rivière, falaise, ancienne serre à restaurer.
- Le relief se modifie : creuser une mare, lever une butte, tracer un ruisseau.

### Décor

- Plus de 600 éléments au lancement : végétation, lumières, fontaines, statues, panneaux, clôtures, objets du quotidien.
- Ensembles thématiques (guinguette, jardin japonais, bois flotté, Art nouveau, ferme flamande) avec bonus d'ensemble.
- Versions de nuit : guirlandes, lanternes, lampadaires.
- **Imperfection voulue :** pots légèrement de travers, mousse sur les vieux murs, fleurs sauvages qui poussent seules au bord des allées.

### Mode promenade et mode photo

- **Promenade :** la caméra descend à hauteur d'enfant et suit un visiteur au choix. On vit son parc de l'intérieur, avec le son spatialisé.
- **Photo :** cadrage libre, profondeur de champ réglable, filtres doux, cadres, interface masquée. Les photos alimentent l'album et le carnet.

## Progression, économie et équilibrage

Un joueur régulier doit avoir l'essentiel du bestiaire de lancement en environ six mois, sans jamais se sentir bloqué ni poussé à payer. Tous les chiffres ci-dessous sont des cibles de départ, validées puis corrigées par simulation automatique.

### Niveaux du parc

- 50 niveaux, gagnés par les étoiles du parc (l'attractivité cumulée).
- Chaque niveau débloque quelque chose de concret : une espèce dans les arrivages, un bâtiment, un ensemble de décor, une parcelle.
- Les biomes s'ouvrent progressivement : 3 au départ, puis un nouveau tous les 3 à 4 niveaux.

### Formules de base

Attractivité d'un enclos :

```latex
A_{enclos} = A_{esp\grave{e}ce} \times (1 + 0{,}2 \times \acute{e}toiles) \times (1 + 0{,}1 \times vue) \times bonus_{quartier}
```

Visiteurs par minute, plafonnés par la capacité d'accueil (entrée, allées, services) :

```latex
V = \min\left(k \times \sqrt{A_{totale}},\ capacit\acute{e}\right)
```

Recettes par minute :

```latex
R = V \times (prix_{entr\acute{e}e} + d\acute{e}pense_{moyenne} \times satisfaction)
```

La racine carrée évite l'explosion des revenus en fin de partie : chaque nouvel enclos compte, sans inflation.

### Sources et dépenses de chaque monnaie

| Monnaie | Sources | Dépenses | Risque surveillé |
| --- | --- | --- | --- |
| Pièces | Visiteurs, hors ligne, demandes du jour | Bâtiments, améliorations, parcelles, décor, guichet | Accumulation sans usage en fin de partie |
| Tickets d'arrivage | Courrier, demandes, niveaux, carnet, événements, guichet, pub volontaire | Arrivages | Pénurie entre deux niveaux |
| Médailles de soin | Arrivages, doublons | Catalogue du refuge | Choix garanti trop rapide ou trop lent |
| Tickets décor | Satisfaction, photos, collections | Caisses de décor | Peu de valeur si le décor sature |

### Rythme visé pour un joueur régulier

| Moment | Espèces possédées | Biomes ouverts | Niveau du parc | Emblématiques |
| --- | --- | --- | --- | --- |
| Fin de la 1re session (15 min) | 5 | 1 | 3 | 0 |
| Fin du 1er jour | 12 | 2 | 6 | 0 |
| Fin de la 1re semaine | 35 | 5 | 14 | 1 |
| Fin du 1er mois | 80 | 9 | 26 | 3 |
| Fin du 3e mois | 125 | 13 | 38 | 6 |
| Fin du 6e mois | 155 | 15 | 48 | 9 |

Tickets par jour visés : 12 à 15 la première semaine, puis 6 à 8, plus les événements.

### Progression hors ligne

- Les recettes continuent pendant l'absence, à plein taux jusqu'à 12 heures, puis plafonnées.
- Au retour, le journal du parc raconte ce qui s'est passé au lieu d'afficher un simple chiffre.
- Aucune raison de se connecter toutes les heures : le jeu récompense le plaisir de revenir, pas la fréquence.

### Équilibrage par simulation

La logique du jeu étant séparée de l'affichage, un script simule des mois de jeu en quelques secondes avec trois profils :

| Profil | Habitude simulée |
| --- | --- |
| Occasionnel | 2 sessions de 5 minutes par jour |
| Régulier | 5 sessions de 8 minutes par jour |
| Passionné | 2 heures par jour |

Le script vérifie à chaque modification : le rythme d'acquisition des espèces, l'inflation des pièces, le nombre de jours sans nouveauté, et qu'aucun joueur ne reste bloqué. Un changement qui casse une cible fait échouer les tests.

## Saisons, météo et événements

Le parc vit au rythme du vrai calendrier : saisons réelles, météo changeante, fêtes annuelles qui reviennent chaque année. Rien n'est jamais perdu pour toujours.

### Cycle jour et nuit

- Deux réglages : **heure réelle** (le parc suit l'horloge du téléphone) ou **cycle accéléré** (une journée complète en 24 minutes).
- Six ambiances : aube, matin, midi, après-midi doré, coucher du soleil, nuit bleue.
- La nuit, le parc reste ouvert en nocturne : lanternes, lampadaires, espèces nocturnes actives, visiteurs moins nombreux mais plus contemplatifs.

### Météo

| Temps | Effet visuel | Effet sur le parc |
| --- | --- | --- |
| Soleil | Ombres nettes, reflets sur l'eau | Visiteurs nombreux, glaces très demandées |
| Nuages | Lumière douce et diffuse | Neutre |
| Pluie fine | Flaques, gouttes sur les vitres, parapluies | Abris recherchés, cafés pleins |
| Orage lointain | Grondement au loin, ciel dramatique | Rare, jamais dangereux, visiteurs à l'abri |
| Brouillard matinal | Silhouettes dans la brume | Ambiance mystérieuse, se lève dans la matinée |
| Neige | Toits blancs, traces de pas | Chocolat chaud, animaux du froid ravis |
| Vent | Feuilles qui volent, drapeaux | Petits moments (chapeau envolé) |
| Arc-en-ciel | Après une averse ensoleillée | Moment rare photographiable |

Le joueur choisit son hémisphère pour que les saisons correspondent à sa réalité.

### Saisons

- **Printemps :** floraisons, oiseaux migrateurs de passage.
- **Été :** longues soirées, nocturnes, brumisateurs, bains des animaux.
- **Automne :** feuilles rousses au sol, brame des cerfs, citrouilles, lumière dorée.
- **Hiver :** neige, guirlandes, marché de Noël, bains chauds des macaques.

### Fêtes annuelles

| Fête | Période | Contenu |
| --- | --- | --- |
| Printemps | Avril |  |
| Semaine des océans | Juin | Biome océan à l'honneur, décor marin |
| Nuits d'été | Juillet et août | Nocturnes, lanternes flottantes sur le lac, guinguette |
| Halloween douce | Fin octobre | Citrouilles, chauves-souris à l'honneur, déguisements d'enfants |
| Lumières d'hiver | Décembre | Marché, guirlandes, neige, chocolat chaud |
| Nouvel An lunaire | Janvier ou février | Lanternes rouges, animal de l'année à l'honneur |
| Anniversaire du parc | Date d'installation du joueur | Photo de groupe des soigneurs |

### Règles anti-FOMO

- Chaque fête revient l'année suivante, avec le même contenu plus des nouveautés.
- Le décor d'une fête rate peut s'obtenir hors saison au catalogue, avec des copeaux.
- Les quêtes de fête sont courtes et sans compte à rebours anxiogène affiché en permanence.

## Carnet du soigneur et collections

Le carnet est la partie secondaire pour les joueurs patients : un vrai livre de nature, juste et vérifié, qui se remplit en observant ses animaux plutôt qu'en payant.

### Une page par espèce

- Illustration dessinée de l'espèce, dans le style du carnet (aquarelle et encre).
- Nom commun, nom scientifique, biome, région d'origine.
- Statut de conservation selon la Liste rouge de l'UICN, mis à jour à chaque version du jeu.
- Régime alimentaire, taille, poids, longévité.
- Trois anecdotes vérifiées, écrites simplement.
- Comportements observés : cases à cocher qui se remplissent quand le joueur voit le comportement dans son parc.
- Les photos prises par le joueur, collées comme dans un vrai carnet.

### Observer pour débloquer

- Un mode « observer » : on zoome sur un enclos et on attend. Quand un comportement non vu se produit, la case se coche avec une petite animation de crayon.
- Chaque page complétée rapporte des tickets d'arrivage.
- Les comportements rares (moments rares) remplissent une section spéciale « Souvenirs ».

### Exemples d'anecdotes (à faire valider avant intégration)

- **Capybara :** le plus grand rongeur du monde. Très à l'aise dans l'eau, il vit en groupe.
- **Flamant rose :** sa couleur vient des pigments de son alimentation. Il se repose souvent sur une seule patte.
- **Loutre de mer :** elle dort sur le dos et se tient parfois à ses congénères pour ne pas dériver. Elle utilise des pierres pour ouvrir les coquillages.

### Règle de vérité

- Chaque fait vient d'une source fiable (UICN, muséums, encyclopédies naturalistes) et sa source est notée dans un fichier interne.
- Relecture humaine obligatoire, et si possible relecture par un passionné ou un soigneur.
- Une page « Sources » dans le jeu liste les références utilisées.
- En cas de doute, on retire le fait plutôt que de risquer une erreur.

### Collections thématiques

| Collection | Contenu | Récompense |
| --- | --- | --- |
| Les rayés | Zèbre, tigre, okapi, tenrec | Ensemble de décor « rayures » |
| Les tachetés | Guépard, jaguar, girafe, hyène, requin-zèbre | Lampadaires tachetés |
| Les nocturnes | Tout le nocturama, chouettes, kiwi, hérisson | Lanternes de nuit |
| Les géants | Éléphant, girafe, requin-baleine, rhinocéros | Statue monumentale |
| Les marsupiaux | Kangourou, koala, wombat, diable de Tasmanie | Arche d'entrée australienne |
| Les sourires | Quokka, axolotl, paresseux, capybara | Banc « sourire » |
| Les manchots | Les sept espèces | Toboggan de glace |
| La ferme complète | Toutes les races de la ferme | Grange ancienne restaurée |
| Un biome entier | Toutes les espèces d'un biome | Monument du biome et thème musical complet |

### Album photo

- Toutes les photos du mode photo et des moments rares, classées par date et par espèce.
- Export en image pour partager hors du jeu, avec un petit cadre discret du parc.
- Un « souvenir de l'année » automatique à l'anniversaire du parc.

## Direction artistique

La formule validée sur le diorama : des personnages ronds façon Ulala, dans une mise en scène façon Octopath, avec la lumière comme personnage principal. L'objectif est l'authenticité, pas la perfection : un monde qui a l'air fait à la main par quelqu'un qui l'aime.

### Caméra

- Vue isométrique orthographique, rotation libre à deux doigts.
- Trois niveaux de zoom qui changent ce qu'on voit : le parc entier, un quartier, un enclos.
- Mode promenade à hauteur de visiteur et mode photo (voir Aménagement).
- Transitions douces et lentes, jamais de secousse de caméra.

### Lumière

- Six ambiances du cycle jour/nuit, avec une palette propre à chacune.
- Ombres douces et longues au coucher du soleil.
- Lumière chaude des lampadaires et lanternes, qui éclaire vraiment le sol et les visiteurs.
- Reflets physiques : soleil sur l'eau, lampadaires dans les bassins la nuit, éclats sur les vitres. Aucune particule décorative sans raison.
- Rayons de lumière discrets à travers les arbres le matin, brume au ras des mares à l'aube.

### Profondeur : l'effet maquette

- Flou adaptatif validé : presque nul en vue d'ensemble, marqué quand on zoome sur un enclos.
- Toujours centré sur ce que le joueur regarde.
- Désactivable dans les options, et coupé automatiquement sur les téléphones modestes.

### Palette

- Chaude et légèrement désaturée, loin des couleurs criardes des idle games.
- Une palette par biome : ocres et paille pour la savane, verts profonds pour les jungles, bleus et blancs cassés pour l'Arctique.
- Les animaux gardent leurs vraies couleurs, légèrement simplifiées.

### Rendu

- Ombrage en trois tons façon dessin animé pour les animaux et les visiteurs.
- Contour fin et sombre sur les animaux, pour les détacher du décor et faciliter la reconnaissance à distance.
- Décor en volumes simples à facettes, avec des couleurs peintes par sommet pour éviter l'aspect plastique.

### Le guide de l'imperfection

Tu ne veux pas du trop parfait. Voici comment le jeu l'applique concrètement :

- légères asymétries : une oreille un peu plus basse, une branche tordue ;
- variations de teinte sur l'herbe, les toits, les feuilles ;
- usure : mousse sur les vieux murs, peinture écaillée sur les vieux bancs du parc  ;
- objets légèrement de travers, jamais tous alignés au cordeau ;
- traces de vie : flaques après la pluie, empreintes dans la neige, miettes sous les tables du café ;
- fleurs sauvages qui poussent seules au bord des allées au fil des semaines.

### Règles de reconnaissance des animaux

Voir la section Vie animale. En résumé : silhouette lisible à 48 pixels, trois traits signatures exagérés, couleurs fidèles, pose signature au repos, contour fin.

### Interface

- Inspirée d'un carnet de terrain : papier crème, encre, petits croquis.
- Typographie lisible en priorité ; une police plus manuscrite seulement pour les titres et le carnet.
- Icônes dessinées dans le même trait que le carnet.

### Fabrication des modèles 3D

- Les modèles sont générés par des scripts Blender écrits avec l'IA, puis exportés en glTF. C'est du code : reproductible, modifiable, cohérent.
- Une bibliothèque de pièces par famille (têtes, corps, pattes, queues, oreilles) assure la cohérence de style entre 160 espèces.
- Une seule texture de palette partagée par tous les modèles, pour la performance et l'unité.
- Contrôles automatiques à l'export : nombre de polygones, nommage, échelle, présence des animations obligatoires.
- Chaque espèce passe une revue visuelle humaine côte à côte avec des photos réelles avant validation.

### Budgets de performance

| Élément | Budget |
| --- | --- |
| Animal (près) | 1 500 à 4 000 triangles |
| Animal (loin) | 300 à 800 triangles, signatures conservées |
| Visiteur | 800 à 1 500 triangles |
| Visiteurs animés à l'écran | 250 au maximum |
| Animaux animés à l'écran | 300 au maximum |
| Textures | Un atlas de palette partagé, quelques textures de décor |

## Audio et musique

Le son est la signature du jeu : une ambiance qui respire, un parc qu'on entend vivre, et une musique lofi douce qui arrive par touches puis laisse la place au silence. La musique est composée pour le jeu et jouée avec de vrais instruments échantillonnés.

### Paysages sonores

- Chaque biome a sa couche d'ambiance : insectes et vent chaud pour la savane, oiseaux et gouttes sur les feuilles pour la jungle, vent et craquements de glace pour l'Arctique, bulles et sons étouffés pour l'aquarium.
- Le son suit la caméra : dézoomé, on entend la rumeur générale du parc ; zoomé sur un enclos, on entend ses animaux et l'eau.
- La météo a sa couche : pluie sur les toits et les parapluies, neige qui étouffe tout, vent dans les arbres.
- La nuit change tout : grillons, chouettes, une fontaine qu'on entend enfin.

### Visiteurs

- Un murmure de foule sans paroles compréhensibles, plus ou moins dense selon la fréquentation.
- Rires d'enfants occasionnels, pas sur le gravier ou les passerelles en bois, applaudissements aux nourrissages.
- Petites onomatopées attendrissantes quand un visiteur s'émerveille.

### Animaux

- Vocalisations réelles de chaque espèce, issues de banques sonores sous licence vérifiée, retravaillées pour rester douces.
- Bruitages de mouvement : plongeon, ailes, sabots, mastication, ébrouement.
- Les cris forts (lions, loups, gibbons) sont rares et atténués par la distance.

### Musique

| Moment | Instruments | Humeur |
| --- | --- | --- |
| Aube | Guitare acoustique, nappes légères | Réveil, fraîcheur |
| Matin et midi | Piano lofi, batterie feutrée, basse ronde | Insouciance |
| Après-midi doré | Piano électrique, guitare, cordes discrètes | Chaleur |
| Coucher du soleil | Piano électrique, violoncelle, vinyle | Nostalgie douce |
| Nuit | Piano feutré, vibraphone, contrebasse | Calme profond |
| Hiver | Celesta, cloches lointaines | Cocon |

- **Par touches :** une phrase musicale de 1 à 2 minutes, puis 2 à 4 minutes d'ambiance seule. Le silence fait partie de la composition.
- **Couleurs de biome :** une touche d'instrument propre au quartier où l'on zoome (kalimba dans la savane, flûte dans les montagnes), toujours discrète et jamais caricaturale.
- **Moments musicaux :** court thème à chaque arrivage, thème propre pour chaque emblématique.
- **Thème du parc :** une mélodie principale reconnaissable, déclinée dans toutes les ambiances.
- Composée par Claude (harmonies, mélodies, structure) et rendue avec des banques d'instruments libres de droits, vérifiées une par une.

### Interface sonore

- Sons doux de bois, de papier et de crayon, jamais criards.
- Chaque son d'interface est accompagné d'une vibration légère et désactivable.
- Ouverture d'une caisse d'arrivage : bois, paille, puis le cri de l'animal.

### Mixage et options

- Quatre curseurs : musique, ambiance, animaux, interface.
- Volume perçu homogène et adapté au mobile, sans pics.
- Fonctionne bien au casque, avec une spatialisation simple gauche-droite selon la position à l'écran.
- Sous-titres sonores optionnels pour les joueurs sourds ou malentendants (« les loups hurlent au loin »).

## Interface et expérience joueur

L'interface s'efface devant le parc : le jeu s'ouvre directement sur le parc, sans écran titre, comme pour Bauform, et toute action fréquente se fait en trois touches au plus, à une main.

### Principes

- Le parc occupe tout l'écran ; l'interface tient sur deux bandeaux fins.
- Une seule pastille d'attention à la fois, jamais une cascade de points rouges.
- Texte de 14 points minimum, contraste vérifié.
- Tout est accessible au pouce en bas de l'écran.
- Chaque action est réversible ou confirmée si elle coûte cher.

### Écran principal

- **En haut :** pièces, tickets d'arrivage, heure et météo du parc en petit.
- **En bas :** cinq boutons — Construire, Arrivages, Carnet, Parc, Menu.
- Les bulles de visiteurs et les moments rares apparaissent dans le monde, pas dans des fenêtres.

### Les écrans

| Écran | Contenu |
| --- | --- |
| Construire | Catalogue par catégories, recherche, favoris, aperçu avant pose, coût, annuler |
| Arrivages | Bannières, taux détaillés, compteurs de garantie, historique, catalogue du refuge |
| Carnet | Pages d'espèces, comportements observés, collections, album, sources |
| Parc | Satisfaction par zone, suggestions des visiteurs, finances simples, prix, personnel |
| Journal | Ce qui s'est passé depuis la dernière visite, raconté en quelques lignes |
| Courrier | Nouvelles des refuges partenaires, ticket du jour, cadeaux |
| Photo | Mode photo plein écran sans interface |
| Paramètres | Son, graphismes, accessibilité, langue, hémisphère, heure réelle ou accélérée, sauvegarde |
| Soutien | Pack de soutien et ensembles de décor, sans pression |

### Gestes

- Glisser : déplacer la vue. Pincer : zoomer. Tourner à deux doigts : pivoter.
- Tap : sélectionner un animal, un visiteur, un bâtiment.
- Appui long : déplacer un élément.
- Double tap : centrer et zoomer sur ce qu'on touche.
- Retour haptique léger sur chaque geste important.

### Premières minutes

1. Ouverture sur le vieux parc au lever du soleil.
2. Le joueur trace sa première allée et pose un banc, guidé par une main dessinée.
3. Premier arrivage offert : les capybaras déménagent dans un vrai enclos.
4. Les premiers visiteurs entrent ;&#32;
5. puis le joueur est libre.

Aucun mur de tutoriel : les conseils arrivent au moment où ils servent, et tout peut être passé.

### Notifications

- Toutes facultatives, une par jour au maximum.
- Toujours positives : « Il neige sur ton parc ».
- Jamais de culpabilisation ni d'urgence artificielle.

### Accessibilité

- Modes daltonisme (trois types) et contraste élevé.
- Taille du texte réglable.
- Réduction des mouvements : coupe le flou, les transitions de caméra et les secousses.
- Modes arachnophobie et ophidiophobie.
- Sous-titres sonores.
- Interface inversée pour gauchers.
- Lecture d'écran sur les menus principaux.

### Performance ressentie

- 60 images par seconde visées sur un téléphone récent, 30 stables sur un modèle modeste.
- Qualité graphique ajustée automatiquement au premier lancement, modifiable ensuite.
- Mode économie de batterie.
- Démarrage du jeu en moins de 5 secondes sur un téléphone récent.

### Langues

Français et anglais au lancement, puis espagnol, allemand, portugais et japonais selon l'accueil.

## Monétisation éthique

Le jeu est gratuit et se finance par des achats directs, jamais aléatoires, et par des publicités récompensées que le joueur choisit de regarder. La règle absolue : l'argent réel n'achète jamais un tirage, ni rien qui en donne.

### Ce qui est vendu

| Offre | Contenu | Prix indicatif, à tester |
| --- | --- | --- |
| Pack Soutien au refuge | Plus aucune publicité, leurs récompenses données automatiquement, tenue de soigneur, filtres photo, cadre d'album | 5 à 10 €, achat unique |
| Ensembles de décor | Un thème complet, choisi et connu à l'avance (guinguette, jardin japonais) | 1 à 3 € |
| Pass de saison cosmétique | Décor et tenues de saison, sans ticket ni médaille | 3 à 5 € par saison |
| Pourboire | Remerciement libre | Au choix |

### Publicités récompensées

- Uniquement à la demande du joueur, depuis un seul endroit : la boîte aux lettres du refuge.
- Trois par jour au maximum : un ticket d'arrivage, un bonus de recettes hors ligne, une caisse de décor.
- Jamais d'interstitielle, jamais de bannière, jamais de publicité au lancement.
- Pas de bouton « x2 » dispersé dans l'interface.

### Ce qui ne sera jamais vendu

- Tickets d'arrivage, médailles, tickets décor, copeaux.
- Espèces ou variantes.
- Accélérations de temps ou monnaie premium intermédiaire.
- Offres à compte à rebours, offres personnalisées après une série de tirages malchanceux.

### Pourquoi c'est aussi le bon choix commercial

- Des tirages gratuits restent en dehors des règles qui visent les loot boxes payantes là où elles existent aujourd'hui. À revérifier pays par pays avant la publication.
- C'est un argument de communication fort auprès du public cosy, lassé des jeux prédateurs.
- Les avis sur les stores en bénéficient directement.

### Piste à étudier : reverser une part

Reverser un pourcentage des ventes du Pack Soutien à une association de protection animale renforcerait l'authenticité du refuge. Faisabilité juridique et fiscale à vérifier avec ta micro-entreprise avant toute annonce.

## Technique

Le jeu est écrit en TypeScript avec Three.js et empaqueté en application native avec Capacitor : tout est du code, testable automatiquement, ce qui est la meilleure garantie de zéro erreur quand le développement passe par l'IA.

### Outils

| Besoin | Choix |
| --- | --- |
| Langage | TypeScript en mode strict |
| Rendu 3D | Three.js (WebGL 2, repli WebGL 1) |
| Construction | Vite |
| Application mobile | Capacitor (Android et iOS) |
| Audio | Web Audio, avec une petite couche maison pour le mixage par catégories |
| Modèles 3D | Scripts Blender (Python) exportés en glTF |
| Validation des données | Schémas typés (zod) pour espèces, objets, textes |
| Tests | Vitest pour la logique, Playwright pour les captures visuelles |
| Qualité | ESLint et Prettier stricts, vérification des types à chaque modification |
| Intégration continue | GitHub Actions : tests, simulation d'économie, budgets de performance |
| Rapports de plantage | Sentry ou équivalent, sans données personnelles |

### Architecture en couches

1. **Données :** espèces, objets, textes, taux, tout décrit en fichiers validés par schéma. Ajouter une espèce ne demande pas de toucher au code du jeu.
2. **Simulation :** logique pure, sans affichage ni son. Déterministe, à pas de temps fixe, avec un générateur aléatoire à graine. C'est elle que les tests et la simulation d'équilibrage font tourner.
3. **Gacha :** module isolé dans la simulation, avec ses propres tests statistiques.
4. **Sauvegarde :** format versionné, migrations automatiques entre versions, copie de secours avant chaque écriture.
5. **Rendu :** lit l'état de la simulation et le dessine ; ne décide jamais rien.
6. **Audio :** écoute les événements de la simulation et la position de la caméra.
7. **Interface :** menus et bandeaux, au-dessus du rendu.

### Tests qui garantissent la qualité

- **Gacha :** un million de tirages simulés à chaque modification, taux vérifiés à 0,1 point près, garanties vérifiées sans exception.
- **Économie :** simulation de 180 jours pour les trois profils de joueurs, avec les cibles de la section équilibrage.
- **Sauvegarde :** écriture, relecture, sauvegardes corrompues ou anciennes, coupure en pleine écriture.
- **Visuel :** captures automatiques de scènes de référence comparées à la version précédente.
- **Performance :** une scène de parc chargé doit tenir son budget d'images par seconde dans l'intégration continue.

### Performance mobile

- Objets répétés (arbres, clôtures, visiteurs) dessinés en une seule fois par instanciation.
- Versions simplifiées des modèles au loin, objets hors champ ignorés.
- Une seule texture de palette partagée.
- Ombres et effets de profondeur ajustés selon trois niveaux de qualité, choisis par un petit test au premier lancement.
- Simulation des zones lointaines à fréquence réduite.

### Sauvegarde et compte

- Sauvegarde locale automatique, sans compte.
- Sauvegarde dans le cloud facultative via les services de Google et d'Apple, à vérifier selon les extensions Capacitor disponibles.
- Code d'export manuel pour changer de téléphone sans dépendre d'un service.

### Contraintes à anticiper

- La compilation iOS demande un Mac ou un service de compilation en ligne.
- Les comptes développeur Google Play et Apple sont payants.
- Aucun serveur n'est nécessaire : pas de coût d'hébergement, pas de panne serveur.
- Mesures d'audience minimales et facultatives, conformes au RGPD.

## Production et plan de développement

Le jeu se construit en six phases, et aucune ne commence avant que la précédente ait passé sa porte de qualité. Pas de date imposée : la qualité décide du rythme.

&#91;embedded content: feuille de route · 6 phases, 5 portes de qualité, sans dates\]

La tranche verticale est la phase décisive : si ces 15 minutes ne sont pas irréprochables, produire 160 espèces ne ferait que multiplier les défauts.

### Méthode de travail avec l'IA

- Un brief court par tâche, avec les critères d'acceptation et les tests attendus.
- Une tâche par session de Claude Code, pour économiser le quota hebdomadaire.
- Le contenu (espèces, objets, textes) est produit par lots, à partir de modèles validés une fois.
- Chaque modification passe les tests automatiques avant d'être gardée.
- Ce document reste la référence : toute décision nouvelle y est ajoutée.

### Définition de « terminé » pour chaque espèce

- [ ] Modèle validé côte à côte avec des photos réelles
- [ ] Silhouette reconnue au test
- [ ] 12 comportements minimum, dont 2 signatures
- [ ] Habitat de base et les cinq étoiles d'enrichissement
- [ ] Vocalisations sous licence vérifiée
- [ ] Page de carnet avec trois faits sourcés et relus
- [ ] Version simplifiée à distance qui garde les signatures
- [ ] Budget de performance respecté

### Avant le Steam Next Fest de février

Pour ne pas mettre Cage Legacy en danger, seules les phases 0 et 1 sont visées avant février. Le contenu en masse commence après la démo.

## Risques et questions ouvertes

Le premier risque est l'ampleur du projet : ce document décrit un jeu de studio. Il se réalise seul uniquement par phases strictes, avec une tranche verticale irréprochable avant tout contenu en masse.

### Risques

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Ampleur du contenu (160 espèces, 600 objets) | Projet jamais terminé | Lancement possible à 60 espèces ; le reste arrive par mises à jour |
| Performance WebGL sur Android modeste | Saccades, batterie | Budgets testés dès la tranche verticale, trois niveaux de qualité |
| Quota d'IA hebdomadaire | Semaines bloquées | Briefs courts et ciblés, une tâche par session, tests automatiques pour éviter les allers-retours |
| Qualité inégale des modèles générés | Style incohérent, IA qui se voit | Bibliothèque de pièces par famille, revue humaine côte à côte avec des photos |
| Animaux difficiles à reconnaître | Collection sans saveur | Test des silhouettes obligatoire |
| Gacha trop généreux ou trop avare | Ennui ou frustration | Simulation automatique, ajustement après le lancement doux |
| Erreurs factuelles dans le carnet | Crédibilité perdue | Sources notées, relecture humaine, retrait en cas de doute |
| Licences des sons et instruments | Retrait du jeu des stores | Registre des licences, uniquement des sources vérifiées |
| Compilation iOS sans Mac | Pas de version iPhone | Service de compilation en ligne ou lancement Android d'abord |
| Chevauchement avec Cage Legacy (Steam Next Fest de février) | Épuisement, deux projets à moitié faits | Phases 0 et 1 seulement avant février, le gros du contenu ensuite |

### Questions ouvertes

- [ ] Nom définitif du jeu (« Zoo Refuge » est provisoire).
- [x] Portrait seul
- [x] Heure réelle par défaut, ou cycle accéléré. Les deux
- [x] Pas de personnages
- [x] Le joueur peut nommer individuellement chaque animaux
- [x] Reverser une part à une association : faisabilité avec la micro-entreprise. Oui
- [ ] Prix exacts du Pack Soutien et des ensembles de décor. 5€, puis 3 puis 5 à revoir
- [ ] Langues au lancement au-delà du français et de l'anglais.
- [x] Android seul d'abord
- [ ] Pays du lancement doux (Belgique, Canada ou Suisse, par exemple).
