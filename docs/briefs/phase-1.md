# Brief — Phase 1 : Tranche verticale

**Objectif de la phase :** 15 minutes de jeu complètes et irréprochables, qu'on montrerait fièrement à n'importe qui. Un seul biome, mais chaque système de base fonctionne pour de vrai : arrivages, enclos, visiteurs, économie, son, interface, premières minutes.

**Pourquoi c'est la phase décisive :** si ces 15 minutes ne sont pas excellentes, produire 160 espèces ne ferait que multiplier les défauts. On ne passe à la phase 2 que lorsque la porte de sortie est franchie.

**Prérequis :** la phase 0 est terminée et sa porte de sortie est franchie.

---

## Périmètre

### Dans la tranche

| Élément | Contenu |
| --- | --- |
| Biome | Amérique tropicale |
| Espèces (5) | Capybara (Commun, 4), Pécari à collier (Commun, 5), Tapir du Brésil (Peu commun, 2), Loutre géante (Rare, 4), Jaguar (Très rare, 2) |
| Visiteurs (5 archétypes) | Famille avec poussette, Parent et enfant sur les épaules, Couple, Ado photographe, Retraités |
| Construction | Allées, enclos à forme libre (tailles S, M, L), kits d'habitat, bancs, poubelles, toilettes, kiosque à glaces, fontaine à eau |
| Départ du parc | Grand terrain, entrée du parc, deux places de parking |
| Gacha | Bannière permanente, arrivage de bienvenue, compteurs de garantie, doublons (étoiles et croissance du groupe), médailles de soin, catalogue du refuge, historique |
| Économie | Pièces, tickets d'arrivage, médailles, étoiles du parc, prix d'entrée réglable, recettes hors ligne, courrier quotidien, guichet à tickets |
| Lumière | Une ambiance fixe : après-midi doré |
| Audio | Ambiance du biome, rumeur des visiteurs, sons d'interface, un morceau lofi, thème court d'arrivage |
| Interface | Bandeau du haut, barre du bas, écrans Construire, Arrivages, Parc, Paramètres de base |
| Premières minutes | Tutoriel jusqu'au premier enclos et aux premiers visiteurs |

Les chiffres entre parenthèses après chaque espèce sont sa rareté et sa taille de groupe à l'arrivée, repris du bestiaire du GDD.

### Hors tranche (phase 2 et suivantes)

Cycle jour et nuit, météo, saisons, événements, carnet du soigneur, collections, tirages de décor, personnel (prénom, niveau, salaire), enclos partagés, quartiers de biome, mode promenade, mode photo, monétisation, autres biomes.

---

## Règles de jeu précisées pour la tranche

Ces règles complètent le GDD. Elles sont reportées dans `docs/decisions.md` par la tâche 1.1.

- **Taille maximale d'un groupe :** taille à l'arrivée + 3. C'est une valeur de départ, stockée dans les données de chaque espèce et donc ajustable sans toucher au code.
- **Palier de rareté vide :** la tranche n'a aucune espèce Emblématique. Le moteur doit gérer un palier vide : son taux est reporté sur le palier non vide immédiatement inférieur, et l'écran des taux affiche les taux réellement appliqués. Le moteur complet (5 paliers) est testé avec des données de test synthétiques.
- **Arrivage de bienvenue :** le Très rare garanti est choisi parmi les Très rares disponibles, jusqu'à trois. Dans la tranche, il n'y en a qu'un (le jaguar).
- **Courrier quotidien :** un ticket d'arrivage par jour réel, cumulable trois jours au maximum.

---

## Porte de sortie (tout doit être vrai avant la phase 2)

- [ ] `npm run check` et `npm run e2e` sont verts sur `main`.
- [ ] Le test statistique du gacha passe (un million de tirages, taux à 0,1 point près, garanties sans exception).
- [ ] Le simulateur d'économie respecte la cible : les 5 espèces obtenues en environ 15 minutes de jeu pour un profil régulier, sans blocage.
- [ ] Les 5 espèces sont reconnues sur silhouette par plus de 90 % de 10 personnes.
- [ ] 30 images par seconde stables sur un Android modeste, avec 5 enclos et 100 visiteurs à l'écran.
- [ ] Aucune erreur dans la console sur une partie de 15 minutes.
- [ ] 5 testeurs jouent 15 minutes sans aide et disent vouloir continuer.

---

## Outil et relecture

Toutes les tâches se font avec **Claude Code**, dans une session Opus par tâche : le chef planifie et délègue selon la section « Délégation aux sous-agents » de `CLAUDE.md`, fait vérifier, puis fait relire la branche par le sous-agent `relecteur` avant le rapport final.

### Qui écrit le code

| Tâche | Qui écrit le code |
| --- | --- |
| 1.0 Mise à jour du brief | le chef |
| 1.1 Schémas de données | le chef |
| 1.2 Contenu des 4 autres espèces | `contenu` (Haiku) |
| 1.3 Gacha | le chef |
| 1.4 Construction du parc | le chef |
| 1.5 Visiteurs, simulation | le chef |
| 1.6 Économie et équilibrage | le chef |
| 1.7 Modèles des 4 espèces | `executant` (Sonnet) |
| 1.8 Comportements des animaux | `executant` |
| 1.9 Visiteurs en 3D | `executant` |
| 1.10 Rendu de la construction | `executant` |
| 1.11 Interface | `executant` |
| 1.12 Audio de base | le chef pour la composition musicale, `executant` pour le mixeur |
| 1.13 Scène d'arrivage | `executant` |
| 1.14 Premières minutes et passe finale | le chef, `executant` pour les corrections |

Une tâche par session, toujours.

---

## Ordre des tâches

```
1.0 Mise à jour du brief
1.1 Schémas de données ──► 1.2 Contenu des 5 espèces
        │
        ├──► 1.3 Gacha
        ├──► 1.4 Construction du parc ──► 1.5 Visiteurs ──► 1.6 Économie
        │
        └──► 1.7 Modèles des 4 espèces ──► 1.8 Comportements des animaux
                                           1.9 Visiteurs en 3D
1.10 Rendu de la construction (après 1.4)
1.11 Interface (après 1.3, 1.4, 1.6)
1.12 Audio de base
1.13 Scène d'arrivage (après 1.3, 1.8, 1.11)
1.14 Premières minutes et passe finale (en dernier)
```

Une seule tâche à la fois. Toujours une nouvelle session par tâche.

---

## Tâche 1.0 — Mise à jour du brief

**But :** adapter ce brief à ce que la phase 0 a réellement produit (noms de fichiers, API, décisions), pour que les IA suivantes ne se trompent pas.

**Prompt à coller :**

```
Lis AGENTS.md, docs/decisions.md, docs/briefs/phase-0.md et docs/briefs/phase-1.md.
Regarde uniquement la structure de src/ (noms de fichiers et exports publics), sans lire tout le code.
Mets à jour docs/briefs/phase-1.md pour qu'il corresponde au code réel : noms de modules, fonctions existantes, conventions.
Ne change ni le périmètre ni les règles de jeu. Signale-moi toute contradiction entre le brief et le code au lieu de la trancher.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Branche : chore/phase-1-brief. Termine par le rapport final.
```

---

## Tâche 1.1 — Schémas de données

**But :** décrire tout le contenu de la tranche en données validées, pour qu'ajouter une espèce ne demande jamais de code.

**Contenu attendu (dans `src/data`) :**

- Schémas zod pour : espèce, rareté, taux et garanties, kit d'habitat, élément d'enrichissement par étoile, bâtiment et service, décor, archétype de visiteur, bannière.
- Une espèce contient au minimum : identifiant, biome, rareté, taille du groupe à l'arrivée, taille maximale, taille d'enclos minimale, attractivité de base, kit d'habitat, enrichissements des étoiles 2 à 5, clés de texte (nom, signature), référence du modèle 3D, liste des comportements.
- Chargement unique de toutes les données au démarrage, avec erreur claire si un fichier est invalide.
- Données de test synthétiques couvrant les 5 paliers de rareté, utilisées par les tests du gacha.
- Les règles précisées plus haut ajoutées dans `docs/decisions.md`.

**Critères d'acceptation :**

- Un test charge et valide toutes les données.
- Un fichier volontairement faux (rareté inconnue, taille négative, clé de texte absente) est refusé avec un message précis.
- `npm run check` vert.

**Prompt à coller :**

```
Lis AGENTS.md, les sections "Gacha bienveillant", "Bestiaire" et "Enclos et habitats" de docs/gdd.md, puis docs/briefs/phase-1.md, sections "Règles de jeu précisées" et "Tâche 1.1".
Réalise uniquement la tâche 1.1, sur une branche feat/data-schemas.
Propose d'abord les schémas (champs, types, contraintes) et attends mon OK.
Ajoute une seule espèce d'exemple complète (le capybara) pour prouver le format : les quatre autres seront faites à la tâche 1.2.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final.
```

---

## Tâche 1.2 — Contenu des 4 autres espèces

**But :** remplir les données du pécari, du tapir, de la loutre géante et du jaguar en suivant exactement le modèle du capybara.

**Critères d'acceptation :**

- Les quatre espèces passent la validation.
- Raretés et tailles de groupe identiques au bestiaire du GDD.
- Textes en français et en anglais dans `src/i18n`, signatures reprises du bestiaire.
- Aucune modification hors de `src/data` et `src/i18n`.

**Prompt à coller :**

```
Lis AGENTS.md, puis docs/briefs/phase-1.md section "Tâche 1.2", puis le fichier de données du capybara dans src/data.
Crée les données du Pécari à collier, du Tapir du Brésil, de la Loutre géante et du Jaguar, en copiant exactement la structure du capybara.
Raretés, tailles de groupe et signatures : reprends-les du tableau "Amérique tropicale" de la section Bestiaire de docs/gdd.md, sans rien inventer.
Ajoute les textes français et anglais dans src/i18n.
Ne modifie aucun fichier en dehors de src/data et src/i18n. Branche : feat/data-tropical-species.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.3 — Gacha

**But :** le système d'arrivages complet, juste et prouvé.

**Contenu attendu (dans `src/sim`) :**

- Tirage pondéré par rareté, puis par espèce dans le palier, avec le générateur à graine.
- Compteurs de garantie conservés d'une bannière à l'autre : au moins un Rare tous les 10, Très rare garanti au 40e, Emblématique garanti au 90e avec chances en hausse dès le 70e.
- Règle du palier vide.
- Multi-arrivage : 10 arrivages pour le prix de 9.
- Bannière permanente et arrivage de bienvenue (20 premiers, Très rare garanti au choix).
- Doublons : étoile d'habitat (jusqu'à 5) et un individu de plus jusqu'à la taille maximale ; au-delà, 50 médailles. 10 médailles par arrivage.
- Catalogue du refuge : achat d'une espèce déjà rencontrée contre médailles (150, 400, 1 000).
- Historique complet des arrivages dans l'état.
- Commandes et événements correspondants (`performArrival`, `arrivalOpened`, etc.).

**Critères d'acceptation :**

- Test statistique d'un million de tirages sur les données synthétiques à 5 paliers : taux à 0,1 point près, garanties sans exception.
- Tests de chaque cas limite : tickets insuffisants, palier vide, groupe déjà au maximum, cinq étoiles atteintes, catalogue sans médailles.
- Couverture ≥ 90 %.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Gacha bienveillant" de docs/gdd.md, puis docs/briefs/phase-1.md, sections "Règles de jeu précisées" et "Tâche 1.3".
Réalise uniquement la tâche 1.3, sur une branche feat/gacha.
Propose d'abord l'algorithme (ordre d'application des garanties, hausse progressive des chances, palier vide), les commandes et les événements, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert, la sortie du test statistique, et le rapport final.
```

---

## Tâche 1.4 — Construction du parc

**But :** la simulation de tout ce qu'on pose dans le parc.

**Contenu attendu (dans `src/sim`) :**

- Grille du terrain, terrain de départ avec entrée et deux places de parking.
- Commandes : tracer une allée, poser et déplacer un enclos à forme libre (surface minimale selon l'espèce), installer un groupe d'animaux dans un enclos, poser un bâtiment ou un service, déplacer gratuitement, supprimer avec remboursement.
- Validation : chevauchement, sortie du terrain, enclos trop petit, bâtiment non relié à une allée, pièces insuffisantes. Chaque refus est une erreur typée avec une clé de texte explicative.
- Annuler et rétablir illimités pendant la session.
- Calcul de la note de vue d'un enclos (points de vue, distance, obstacles) selon le GDD.

**Critères d'acceptation :**

- Tests pour chaque commande et chaque refus.
- Annuler puis rétablir redonne exactement le même état.
- Couverture ≥ 90 %.

**Prompt à coller :**

```
Lis AGENTS.md, les sections "Enclos et habitats" et "Aménagement et gestion du parc" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.4".
Réalise uniquement la tâche 1.4, sur une branche feat/park-building.
Propose d'abord le modèle de la grille, la représentation d'un enclos à forme libre, les commandes et la stratégie d'annulation, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final.
```

---

## Tâche 1.5 — Visiteurs, simulation

**But :** des visiteurs qui viennent, se promènent, ont des besoins et repartent contents.

**Contenu attendu (dans `src/sim`) :**

- Arrivée des visiteurs selon la formule de fréquentation du GDD, plafonnée par la capacité.
- Déplacement sur les allées (recherche de chemin sur la grille, mise en cache des chemins).
- Besoins : émerveillement, faim et soif, repos, confort. Recherche du service adapté quand un besoin monte.
- Arrêts aux points de vue, durée selon la note de vue.
- Satisfaction lissée par visiteur et par zone. Une baisse ne punit jamais : elle réduit un peu les dépenses.
- Bulles de pensée : choix d'une clé de texte selon l'état du visiteur, regroupées dans un fil de suggestions.
- Dépenses aux services et départ du parc.
- Simulation légère : les visiteurs loin de la caméra sont mis à jour moins souvent (fréquence fournie par `app`, jamais lue dans `sim`).

**Critères d'acceptation :**

- 250 visiteurs simulés en moins de 2 ms par pas sur un PC de développement (test de performance).
- Tests : un parc sans banc fait apparaître la suggestion de banc ; un visiteur trouve toujours la sortie ; aucun blocage dans une allée étroite.
- Couverture ≥ 90 %.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Visiteurs" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.5".
Réalise uniquement la tâche 1.5, sur une branche feat/visitors-sim.
Propose d'abord le modèle d'un visiteur, l'algorithme de recherche de chemin, la gestion des besoins et la stratégie de performance, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert, le résultat du test de performance, et le rapport final.
```

---

## Tâche 1.6 — Économie et équilibrage

**But :** une boucle d'argent juste, réglée par simulation et non au hasard.

**Contenu attendu :**

- Formules d'attractivité, de fréquentation et de recettes du GDD, avec toutes les constantes nommées dans `src/data`.
- Prix d'entrée réglable, avec estimation de l'effet avant validation.
- Entretien léger déduit automatiquement, plancher de recettes : pas de faillite possible.
- Recettes hors ligne : plein taux jusqu'à 12 heures, puis plafonnées. Résumé pour le journal.
- Courrier quotidien et guichet à tickets (3 tickets par jour contre des pièces).
- Niveaux du parc par étoiles, avec les déblocages de la tranche.
- Simulateur `npm run sim` étendu aux trois profils du GDD, avec la cible de la tranche.

**Critères d'acceptation :**

- Le simulateur montre les 5 espèces obtenues en environ 15 minutes pour le profil régulier, et aucun profil bloqué.
- Un test fait échouer la vérification si la cible n'est plus respectée.
- Couverture ≥ 90 %.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Progression, économie et équilibrage" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.6".
Réalise uniquement la tâche 1.6, sur une branche feat/economy.
Propose d'abord les constantes de départ et ton raisonnement, et attends mon OK.
Ajuste ensuite les constantes avec le simulateur jusqu'à atteindre la cible. Montre-moi la sortie finale du simulateur pour les trois profils.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final.
```

---

## Tâche 1.7 — Modèles des 4 espèces

**But :** produire le pécari, le tapir, la loutre géante et le jaguar avec le pipeline Blender de la phase 0.

**Contenu attendu :**

- Un fichier de description par espèce dans `tools/blender/`, sur le modèle du capybara : proportions, couleurs fidèles, trois traits signatures exagérés (repris du bestiaire).
- Animations obligatoires pour chaque espèce : `idle`, `walk`, `sleep`, `eat`, plus une animation signature (la loutre nage, le jaguar s'étire, le tapir bouge sa trompe, le pécari fouille le sol).
- Ajout des mêmes animations au capybara (`sleep`, `eat`, `swim` en signature).

**Critères d'acceptation :**

- `npm run assets:check` vert pour les cinq modèles.
- Planche de silhouettes générée automatiquement (les cinq espèces en ombre noire à 48 pixels) pour le test de reconnaissance.

**Prompt à coller :**

```
Lis AGENTS.md, puis docs/briefs/phase-1.md section "Tâche 1.7", puis le fichier de description du capybara dans tools/blender/.
Crée les descriptions du Pécari à collier, du Tapir du Brésil, de la Loutre géante et du Jaguar en copiant exactement sa structure.
Traits signatures : reprends la colonne Signature du tableau "Amérique tropicale" de docs/gdd.md et exagère ces trois traits.
Ajoute les animations demandées par le brief, y compris pour le capybara.
Ne modifie pas la bibliothèque de pièces ni le validateur. Branche : feat/models-tropical.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert, la planche de silhouettes, et le rapport final.
```

---

## Tâche 1.8 — Comportements des animaux

**But :** des animaux qui vivent calmement, comme dans le diorama validé.

**Contenu attendu (dans `src/render`) :**

- Contrôleur de comportement par animal : enchaînement de comportements pondérés (marcher, se reposer, manger, dormir, signature), avec des durées variées.
- Respiration et clignement permanents, décalage naturel entre individus (jamais deux gestes synchronisés).
- Déplacements doux dans l'enclos, évitement des bords et des autres animaux, aucune vitesse brusque.
- Utilisation des éléments d'enrichissement selon les étoiles de l'habitat.
- Un groupe qui arrive dans son enclos : il hésite, renifle, puis explore.
- Hasard visuel par un générateur à graine propre au rendu, jamais `Math.random`.
- Animaux loin de la caméra animés à fréquence réduite.

**Critères d'acceptation :**

- Aucune allocation dans la boucle de rendu.
- Validation visuelle par toi : calme, vivant, jamais robotique.
- `npm run check` vert.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Vie animale : comportements et mouvements" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.8".
Réalise uniquement la tâche 1.8, sur une branche feat/animal-behaviour.
Le rendu ne décide rien du jeu : il lit l'état de la simulation et anime. Respecte les frontières d'architecture d'AGENTS.md.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Propose d'abord ton plan et attends mon OK. Termine par npm run check vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.9 — Visiteurs en 3D

**But :** des visiteurs variés et attachants, façon Octopath en version ronde.

**Contenu attendu :**

- Modèles des visiteurs générés par Blender à partir de pièces : âges, silhouettes, teintes de peau, coiffures, tenues, accessoires de la liste du GDD. Assez de combinaisons pour ne jamais voir deux fois la même personne dans une minute.
- Les 5 archétypes de la tranche avec leurs détails propres (poussette, enfant sur les épaules, appareil photo, chapeau et lunettes).
- Animations : marcher, s'arrêter, regarder, montrer du doigt, prendre une photo, s'asseoir.
- Affichage par instanciation pour tenir 100 visiteurs à l'écran.
- Bulle de pensée au toucher d'un visiteur.

**Critères d'acceptation :**

- `npm run assets:check` vert.
- 100 visiteurs à l'écran à 30 images par seconde sur un Android modeste.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Visiteurs" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.9".
Réalise uniquement la tâche 1.9, sur une branche feat/visitors-render.
Utilise le pipeline Blender existant dans tools/blender et l'instanciation pour la performance.
Propose d'abord ton plan (pièces, combinaisons, animations, instanciation) et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.10 — Rendu de la construction

**But :** construire doit être aussi agréable que regarder.

**Contenu attendu :**

- Tracé des allées au doigt avec courbes automatiques.
- Tracé du contour d'un enclos, aperçu en temps réel (vert si valide, message doux sinon).
- Aperçu fantôme d'un bâtiment avant pose, rotation, aimantation douce.
- Rendu des enclos, clôtures, kits d'habitat, eau animée avec reflets du soleil, bâtiments et services.
- Objets répétés en instanciation, imperfections voulues (légers décalages, variations de teinte).
- Retour haptique léger à la pose.

**Prompt à coller :**

```
Lis AGENTS.md, les sections "Aménagement et gestion du parc" et "Direction artistique" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.10".
Réalise uniquement la tâche 1.10, sur une branche feat/build-render.
Toute action passe par les commandes de la simulation existantes ; le rendu ne modifie jamais l'état.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Propose d'abord ton plan et attends mon OK. Termine par npm run check vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.11 — Interface

**But :** une interface qui s'efface devant le parc, façon carnet de terrain.

**Contenu attendu (dans `src/ui`, en Preact) :**

- Bandeau du haut : pièces, tickets d'arrivage.
- Barre du bas : Construire, Arrivages, Parc, Menu.
- Écran Construire : catalogue par catégories, coût, aperçu.
- Écran Arrivages : bannières, taux réellement appliqués, compteurs de garantie, historique, catalogue du refuge.
- Écran Parc : satisfaction, fil de suggestions, prix d'entrée avec estimation.
- Paramètres : volumes (musique, ambiance, animaux, interface), qualité graphique, langue.
- Style carnet : papier crème, encre, textes de 14 points minimum, contraste vérifié, tout accessible au pouce.
- Tous les textes passent par `src/i18n`.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Interface et expérience joueur" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.11".
Réalise uniquement la tâche 1.11, sur une branche feat/ui-base.
L'interface envoie des commandes à la simulation et écoute ses événements ; elle n'importe jamais src/render ni src/audio.
Propose d'abord la liste des écrans et composants et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check et npm run e2e verts et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.12 — Audio de base

**But :** poser la signature sonore du jeu.

**Contenu attendu (dans `src/audio`) :**

- Mixeur par catégories (musique, ambiance, animaux, interface), relié aux paramètres.
- Ambiance du biome tropical qui suit la caméra : rumeur lointaine dézoomé, sons de l'enclos zoomé.
- Rumeur des visiteurs selon la fréquentation.
- Sons d'interface doux (bois, papier, crayon).
- Un morceau lofi composé pour le jeu, joué par touches (une phrase, puis du silence), avec des instruments échantillonnés libres de droits.
- Thème court à l'ouverture d'un arrivage.
- Registre des licences dans `assets/audio/LICENSES.md` : source, licence et lien pour chaque fichier.

**Critères d'acceptation :**

- Aucun fichier audio sans licence vérifiée dans le registre.
- L'audio démarre seulement après une première interaction (règle des navigateurs mobiles), sans erreur.
- Validation par toi, au casque.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Audio et musique" de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.12".
Réalise uniquement la tâche 1.12, sur une branche feat/audio-base.
Propose d'abord l'architecture du mixeur, la composition du morceau (tonalité, tempo, accords, instruments) et les banques de sons envisagées avec leur licence, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
N'utilise aucun son dont la licence n'est pas vérifiable. Termine par npm run check vert et le rapport final.
```

---

## Tâche 1.13 — Scène d'arrivage

**But :** que chaque arrivage soit une petite fête.

**Contenu attendu :**

- Le camion du refuge entre par le portail, les visiteurs se retournent.
- Caisse déposée ; couleur des rubans et lumière selon la rareté, sans fausse tension.
- Ouverture d'un glissement : bois, paille, museau qui dépasse.
- Le groupe sort, hésite, puis découvre son enclos (en s'appuyant sur la tâche 1.8).
- Dix arrivages : montage rapide puis récapitulatif.
- Tout peut être passé d'un toucher.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Gacha bienveillant" (partie mise en scène) de docs/gdd.md, puis docs/briefs/phase-1.md section "Tâche 1.13".
Réalise uniquement la tâche 1.13, sur une branche feat/arrival-scene.
La scène réagit à l'événement d'arrivage de la simulation ; elle ne tire rien elle-même.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Propose d'abord le déroulé image par image et attends mon OK. Termine par npm run check vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 1.14 — Premières minutes et passe finale

**But :** relier le tout en 15 minutes fluides, puis franchir la porte de sortie.

**Contenu attendu :**

- Tutoriel des premières minutes : le terrain avec entrée et parking, le tracé de la première allée, le premier enclos, le premier arrivage offert, les premiers visiteurs. Conseils au bon moment, tout peut être passé.
- Passe de cohérence sur tout le jeu : textes, sons, rythme, cas limites.
- Mesure de performance sur un Android modeste et corrections.
- Planche de silhouettes et protocole du test de reconnaissance (10 personnes).
- Protocole de test pour 5 joueurs dans `docs/playtest.md` : consignes, questions, grille de notes.

**Prompt à coller :**

```
Lis AGENTS.md, la section "Interface et expérience joueur" (premières minutes) de docs/gdd.md, puis docs/briefs/phase-1.md, sections "Porte de sortie" et "Tâche 1.14".
Réalise uniquement la tâche 1.14, sur une branche feat/onboarding-polish.
Propose d'abord le déroulé du tutoriel et la liste des vérifications de la passe finale, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check et npm run e2e verts, l'état de chaque point de la porte de sortie, et le rapport final.
```

---

## Relecture manuelle (facultative)

La relecture normale est faite par le sous-agent `relecteur`, pendant la session de la tâche. Cette section ne sert que si tu veux une seconde relecture, dans une **nouvelle** session Claude Code qui n'a pas écrit le code.

**Relecture (nouvelle session Claude Code, qui n'a pas écrit le code) :**

```
Tu es relecteur senior et tu n'as pas écrit ce code. Lis CLAUDE.md, puis docs/briefs/phase-1.md section "Tâche X".
Relis la branche <nom-de-branche> en suivant la section "Relire une branche" de CLAUDE.md.
Réponds uniquement par trois listes : Bloquant, À corriger, Suggestion, avec fichier, ligne et raison.
Ne réécris pas le code. Vérifie en particulier qu'aucun test n'a été affaibli et qu'aucune règle d'AGENTS.md n'a été contournée.
```

**Correction après relecture (encore une nouvelle session) :**

```
Lis AGENTS.md. Voici la relecture de la branche <nom-de-branche> : <colle la relecture>.
Corrige uniquement les points Bloquant et À corriger. Pour chaque suggestion, dis si tu l'appliques et pourquoi.
Termine par npm run check vert et le rapport final.
```
