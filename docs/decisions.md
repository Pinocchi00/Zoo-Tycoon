# Journal des décisions

Chaque décision structurante est ajoutée ici, la plus récente en bas. Format : contexte, décision, conséquences.

---

## D-001 — Stack web empaquetée en application native

- **Contexte :** développement entièrement assisté par IA, exigence de zéro bug, développeur non spécialiste.
- **Décision :** TypeScript, Three.js, Preact, Vite, Capacitor.
- **Conséquences :** tout est du code, donc testable et lisible par l'IA. Il faudra optimiser la 3D pour les Android modestes. La compilation iOS demande un Mac ou un service en ligne.

## D-002 — Simulation pure et déterministe

- **Contexte :** il faut pouvoir tester le gacha et l'économie sans lancer le jeu, et reproduire n'importe quel bug.
- **Décision :** la logique du jeu vit dans `src/sim`, sans DOM ni Three.js, avec un générateur aléatoire à graine et un temps fourni de l'extérieur.
- **Conséquences :** tests rapides, simulation de mois de jeu en secondes. Le rendu ne décide jamais rien.

## D-003 — Aucun serveur

- **Contexte :** tirages gratuits, jeu hors ligne, coût et pannes à éviter.
- **Décision :** pas de serveur. Sauvegarde locale, sauvegarde cloud facultative via les services Google et Apple plus tard.
- **Conséquences :** un joueur peut tricher sur sa propre sauvegarde ; c'est acceptable puisque rien ne s'achète avec de l'argent réel par tirage.

## D-004 — Monnaies en entiers

- **Contexte :** les nombres à virgule produisent des erreurs d'arrondi.
- **Décision :** toutes les monnaies sont des entiers ; les taux sont en points de base (1 % = 100).
- **Conséquences :** aucune dérive d'arrondi, comparaisons exactes dans les tests.

## D-005 — Simulation à pas fixe de 100 ms

- **Contexte :** l'économie n'a pas besoin de 60 mises à jour par seconde ; le déterminisme exige un pas fixe.
- **Décision :** 10 pas par seconde avec accumulateur ; rattrapage hors ligne par pas grossiers.
- **Conséquences :** simulation légère sur mobile. Les animations restent fluides car elles vivent dans le rendu.

## D-006 — TypeScript 6.0 plutôt que 7.0

- **Contexte :** TypeScript 7.0 est sorti, mais `typescript-eslint` 8.72 (qui fait respecter les règles d'architecture) n'accepte que TypeScript < 6.1.
- **Décision :** TypeScript 6.0.3, la dernière version compatible.
- **Conséquences :** passage à la 7.x dès que `typescript-eslint` la prend en charge, dans une tâche dédiée.

## D-007 — Dépendances de la tâche 0.1

- **Contexte :** AGENTS.md exige de justifier chaque dépendance.
- **Décision :** en plus des outils listés dans la stack (TypeScript, Vite, Vitest, ESLint, typescript-eslint, Prettier) :
  - `@vitest/coverage-v8` : mesure de couverture exigée (90 % sur `sim` et `save`) ;
  - `@eslint/js` et `globals` : règles de base et listes de variables globales d'ESLint, maintenues par l'équipe ESLint ;
  - `@eslint-community/eslint-plugin-eslint-comments` : ESLint ne sait pas seul exiger une justification sur chaque `eslint-disable` ni interdire de désactiver les règles d'architecture ;
  - `@types/node` (version 24, comme Node) : types de Node pour les fichiers de configuration et les outils de `tools/`, jamais pour `src/`.
- **Conséquences :** toutes en développement uniquement, rien n'est livré dans le jeu.

## D-008 — Organisation de la configuration

- **Contexte :** le code du jeu ne doit pas voir les API de Node, et ESLint aurait besoin d'une dépendance de plus (`jiti`) pour lire une configuration TypeScript.
- **Décision :**
  - `tsconfig.json` couvre `src/` (navigateur, sans Node) ; `tsconfig.node.json` couvre la configuration, `tools/` et `tests/` (Node) ; les deux partagent `tsconfig.base.json` ;
  - l'alias `@/` n'est déclaré que dans `tsconfig.json`, et Vite le lit via `resolve.tsconfigPaths` ;
  - `eslint.config.js` reste en JavaScript ;
  - `.gitattributes` impose des fins de ligne LF, pour que Prettier donne le même résultat sous Windows et en CI ;
  - Prettier ignore `AGENTS.md`, `CLAUDE.md` et `docs/`, dont la mise en page est écrite à la main ;
  - ESLint interdit de désactiver par commentaire les règles d'architecture (`no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`, `no-console`).
- **Conséquences :** pour ajouter un dossier d'outils, l'inclure dans `tsconfig.node.json`.

## D-009 — Frontières renforcées après relecture

- **Contexte :** la relecture de la tâche 0.1 a trouvé des contournements des frontières : `import()` dynamique, `globalThis.Date`, `self`, `navigator`.
- **Décision :**
  - `import()` dynamique interdit partout dans `src/` sauf `src/app`, car il échappe à la vérification des imports ;
  - couches pures : `globalThis`, `self`, `navigator`, `process`, `Intl`, `crypto` et les minuteries (`setTimeout`…) sont interdits en plus ;
  - l'ordre `shared ← data ← sim ← save` est appliqué : une couche n'importe que celles qui la précèdent ;
  - les identifiants typés ne sont créés que par une garde de type qui vérifie réellement le format, jamais par une assertion.
- **Conséquences :** le chargement paresseux de code se fait dans `src/app`. Les dates et nombres affichés sont formatés dans `ui`.

## D-010 — Intégration continue et test de démarrage

- **Contexte :** tâche 0.2, GitHub doit refuser tout code cassé.
- **Décision :**
  - `@playwright/test` (version exacte) : seul outil de bout en bout prévu par la stack ; Chromium uniquement pour l'instant ;
  - le test de démarrage tourne sur la version construite (`vite preview`), pas sur le serveur de développement : c'est ce que reçoit le joueur ;
  - il échoue sur toute erreur, tout avertissement ou toute exception non rattrapée dans la console ;
  - la CI GitHub Actions (`.github/workflows/ci.yml`) tourne sur chaque push et chaque pull request : `npm ci`, `npm run check`, puis Playwright ; versions des actions figées, cache npm et cache du navigateur Playwright, limite de 15 minutes, une exécution plus ancienne sur la même branche est annulée ;
  - en CI, Playwright est lancé directement car `npm run check` a déjà construit `dist/` ; en local, `npm run e2e` construit puis teste ;
  - `playwright.config.ts` est ajouté à `tsconfig.node.json` (règle de D-008) ;
  - le contrôle exigé par la protection de `main` s'appelle `check`.
- **Conséquences :** renommer le job `check` oblige à mettre à jour la protection de branche sur GitHub.

## D-011 — Cœur de la simulation (tâche 0.3)

- **Contexte :** la simulation doit être déterministe, sérialisable, et tourner 10 fois par seconde sur mobile sans produire de déchets mémoire.
- **Décision :**
  - `advance`, `catchUp` et `applyCommand` **modifient l'état sur place** au lieu d'en renvoyer une copie : recopier tout le parc à chaque image coûterait trop cher. Le déterminisme reste garanti : même état de départ et mêmes appels donnent le même résultat ;
  - générateur xoshiro128** initialisé par splitmix32, son état (4 entiers 32 bits) vit dans `GameState.rng` ;
  - la file d'événements est hors de `GameState`, pour ne jamais être sauvegardée. Elle est donc passée en troisième argument : `advance(state, deltaMs, events)`, `catchUp(state, offlineMs, events)` et `applyCommand(state, command, events)`, en complément des signatures du brief ;
  - une durée négative ou à virgule, ou une liste de poids vide, lève une exception : ces valeurs viennent de l'app ou de données déjà validées, c'est donc un bug ;
  - les étoiles du parc ne sont pas stockées : le GDD les décrit comme jamais dépensées, elles se calculeront à partir de l'attractivité ;
  - la commande `addCoins` sert au développement : la simulation l'accepte, c'est `app` qui ne l'expose qu'en mode développement ;
  - `src/sim` importe `shared` par chemin relatif, car l'alias `@/` n'existe pas pour les outils de `tools/` ;
  - `tools/sim/run.ts` est lancé directement par Node 24 (qui lit le TypeScript) et charge `src/sim` avec `runnerImport` de Vite : aucune dépendance ajoutée.
- **Conséquences :** le rendu lit l'état sans le modifier et ne garde aucune copie entre deux images. Avec 1 000 000 de tirages, une tolérance de 0,1 point vaut environ 2 écarts-types pour un taux proche de 50 % : le test du gacha (phase suivante) devra choisir ses graines et ses tailles d'échantillon en connaissance de cause.

## D-012 — Sauvegarde blindée (tâche 0.4)

- **Contexte :** une sauvegarde ne doit jamais se perdre, survivre aux mises à jour du jeu et résister aux fichiers abîmés.
- **Décision :**
  - `zod` (version exacte) : prévu par la stack, il valide l'enveloppe et l'état complet, avec le chemin du champ fautif ; le réécrire à la main coûterait plus que la dépendance ;
  - `fake-indexeddb` (version exacte, **tests seulement**) : les tests tournent sous Node, qui n'a pas IndexedDB ; sans lui, l'implémentation IndexedDB ne serait vérifiée qu'à la main. Il n'est jamais livré au joueur ;
  - enveloppe JSON `{ format, formatVersion, writtenAtMs, checksum, payload }`. L'état est gardé **en texte** dans `payload`, pour que la somme de contrôle porte exactement sur ce qui est écrit ;
  - somme de contrôle CRC-32 écrite à la main (sur les unités UTF-16) : elle détecte un fichier tronqué ou abîmé, elle ne protège pas contre la triche. `crypto` reste interdit dans les couches pures ;
  - deux versions distinctes : `formatVersion` pour l'enveloppe, `state.version` pour l'état ; seul l'état a des migrations, chacune de `n` vers `n + 1`. La migration v0 → v1 est factice et sert de preuve ;
  - le schéma de l'état est strict : un champ inconnu rend la sauvegarde invalide ;
  - `deserialize(text)` suit le brief ; `readSave(text)` renvoie en plus la date d'écriture, utile plus tard pour le rattrapage hors ligne ;
  - `src/platform/storage` : une petite interface clé → texte (`TextStore`), avec IndexedDB, repli `localStorage`, puis mémoire (signalée par `kind: 'memory'`) ; `SaveStorage` reçoit la fonction de validation, pour ne pas lier le stockage au format ;
  - écriture sûre : emplacement temporaire → relecture et validation → copie numérotée → relecture et validation → nettoyage. On ne supprime que les copies plus anciennes que la 3ᵉ copie valide la plus récente ; un numéro de copie n'est jamais réutilisé ;
  - une écriture dont la nouvelle copie est vérifiée est un **succès**, même si le nettoyage qui suit échoue : `cleanupFailure` le signale, et le nettoyage est refait à l'écriture suivante. Une erreur de `write` veut toujours dire « pas sauvegardé » ;
  - le schéma refuse un générateur dont les quatre mots valent zéro : xoshiro128** n'en sortirait jamais ;
  - toute erreur à l'ouverture d'IndexedDB (y compris sans objet d'erreur, ou une ouverture bloquée) fait passer à `localStorage` ; la raison est gardée dans `indexedDbFailure` pour le journal de développement ;
  - chargement : la copie valide la plus récente gagne ; une copie illisible (fichier abîmé ou erreur d'E/S) est sautée, et `skippedCopies > 0` indique un repli. `app` émettra alors l'événement `saveRecovered`, ajouté aux événements de `sim`, pour que l'interface informe le joueur.
- **Conséquences :** l'implémentation Capacitor (tâche 0.6) n'a qu'à fournir un `TextStore`. Une sauvegarde venue d'une version plus récente du jeu est refusée puis remplacée par une copie plus ancienne ; elle n'est supprimée qu'après trois nouvelles écritures valides.

## D-013 — Le parc vide en 3D (tâche 0.5)

- **Contexte :** premier rendu Three.js du parc, qui doit tenir 60 images par seconde sur téléphone récent et 30 sur un Android modeste.
- **Décision :**
  - `three` (version exacte, prévu par la stack) et `@types/three` (développement seulement : Three.js ne fournit pas ses types) ;
  - caméra orthographique isométrique (inclinaison `atan(1/√2)`, cap initial 45°). L'état de la caméra (`camera-rig`) est en nombres purs, sans Three.js : les gestes déplacent un **but**, la caméra le rejoint par amortissement exponentiel (constante de 110 ms), indépendant de la fréquence d'affichage ;
  - gestes : un doigt ou clic gauche = déplacer ; pincer ou molette = zoom vers le point visé ; deux doigts qui tournent ou clic droit glissé = rotation. Zoom borné (6 à 72 m de hauteur visible), point visé borné au terrain ;
  - niveaux de qualité : bas = **aucune** ombre et densité plafonnée à 1,5 ; moyen = ombres nettes (carte 1024, rayon 1) ; haut = ombres douces (carte 2048, rayon 4). Densité de pixels toujours plafonnée à 2. Three.js 0.186 a supprimé `PCFSoftShadowMap` (il avertit et le remplace) : la douceur passe par `PCFShadowMap` et `shadow.radius` ;
  - test du premier lancement : rendu en qualité haute, 15 images ignorées puis médiane de 45 intervalles ; ≤ 18,5 ms → haut, ≤ 30 ms → moyen, sinon bas. Le choix est gardé sous la clé `settings.quality`. En attendant un écran d'options, `?quality=low|medium|high` impose un niveau et le garde ;
  - grille de construction dans `src/shared/grid.ts` (cases de 1 m, centrée sur l'origine) car la simulation en aura besoin ; parcelle de départ provisoire de 64 × 64 cases, à déplacer dans `src/data` avec l'achat de parcelles ;
  - boucle : `requestAnimationFrame`, image plafonnée à 250 ms, millisecondes entières transmises à `advance` (les fractions sont reportées). Arrêt complet en arrière-plan (`visibilitychange`) ; le temps passé caché n'est pas rejoué ici, le rattrapage hors ligne viendra avec le chargement des sauvegardes ;
  - `playwright.config.ts` lance Chromium avec `--use-angle=swiftshader` (validé par le propriétaire du dépôt) : le moteur WebGL par défaut sans écran écrit des avertissements de pilote (« GPU stall due to ReadPixels ») que le test de démarrage refuse à juste titre ; SwiftShader donne le même rendu logiciel sur toutes les machines et la CI. Le test n'est pas affaibli ;
  - compteur d'images par seconde chargé par `import()` sous `import.meta.env.DEV` : il est absent du build de production.
- **Conséquences :** le bundle dépasse 500 ko (≈ 136 ko compressé) à cause de Three.js ; Vite l'indique sans échouer. Une découpe en morceaux sera à étudier si le temps de démarrage le demande.

## D-014 — Application Android (tâche 0.6)

- **Contexte :** installer le jeu sur un téléphone Android comme une vraie application, avec une sauvegarde qui survit à la fermeture complète de l'app.
- **Décision :**
  - `@capacitor/core`, `@capacitor/android` (8.5.3) et `@capacitor/cli` (8.5.3, développement seulement) : prévus par la stack. La 8.6.0, sortie la veille, est écartée par prudence ; les trois paquets gardent la même version ;
  - `@capacitor/filesystem` (8.1.5) : la seule façon d'écrire dans le dossier privé de l'app depuis le WebView. Le stockage du WebView (IndexedDB) peut être vidé par Android ou par « Effacer le cache » ; les fichiers de l'app ne disparaissent qu'à la désinstallation. Un fichier par clé, dans `zoo-refuge/` du dossier `Data` ; les clés sont limitées à `[A-Za-z0-9._-]` sans point initial, pour qu'aucune ne sorte de ce dossier. L'absence d'un fichier se vérifie par la liste du dossier, car le code d'erreur « fichier absent » du plugin n'est pas stable ;
  - aucune extension pour l'orientation, la barre d'état ou l'écran allumé : portrait verrouillé dans `AndroidManifest.xml`, plein écran immersif (barres revenant un instant par glissement) et `FLAG_KEEP_SCREEN_ON` dans `MainActivity.java`. Zéro dépendance ; le drapeau ne vaut que tant que l'app est à l'écran. Le rendre désactivable demandera plus tard un petit pont natif ou une extension ;
  - choix du stockage (`openPlatformTextStore`) : fichiers natifs dans l'app, sinon la chaîne navigateur de D-012. Un échec des fichiers natifs fait passer au stockage du WebView, raison gardée dans `nativeFailure` ;
  - `app` charge la sauvegarde au démarrage (nouveau parc si aucune, événement `saveRecovered` si une copie a été sautée) et sauvegarde quand l'app quitte l'écran **et** toutes les 30 s de jeu (`AUTOSAVE_INTERVAL_MS`, provisoire, validé par le propriétaire du dépôt) : Android peut tuer une app en arrière-plan sans prévenir. Les écritures passent une par une ; le texte est pris au moment où la sauvegarde est demandée ;
  - `capacitor.config.json` plutôt que `.ts`, pour ne pas toucher à `tsconfig.node.json`. Identifiant provisoire `com.gardenofearth.zoorefuge`, validé par le propriétaire ;
  - le dossier `android/` est versionné (code natif modifié à la main). Il est exclu d'ESLint et de Prettier (validé par le propriétaire) : sa copie du jeu compilé n'est pas du code source ;
  - `npm run android` construit le jeu et synchronise le projet ; `npm run android:open` ouvre Android Studio.
  - deux réglages du gabarit Capacitor sont gardés volontairement : `allowBackup="true"` laisse la sauvegarde automatique d'Android copier le dossier privé de l'app sur le compte Google du joueur, donc retrouver son parc sur un nouveau téléphone (le format de sauvegarde valide tout ce qui est restauré) ; la permission `INTERNET` est exigée par le WebView de Capacitor, qui sert le jeu depuis un serveur local, et ne fait appel à aucun réseau extérieur (D-003) ;
  - les tests d'exemple Java du gabarit sont supprimés : ils visaient un autre nom d'app et ne testaient rien du jeu ;
  - l'autosauvegarde ne doit jamais arrêter le jeu : une erreur de sérialisation ou une écriture qui lève une exception est journalisée, et la sauvegarde suivante est retentée normalement.
- **Conséquences :** `npm audit` signale une faille modérée dans `uuid`, tirée par `xcode`, l'outil iOS de `@capacitor/cli` : outil de développement, jamais livré, sans effet tant qu'iOS n'est pas visé ; à revoir en montant de version. Le rattrapage hors ligne n'est toujours pas fait : au retour, le parc reprend là où il était. Sur tablette (Android 16, largeur ≥ 600 dp), Android ignore le verrouillage en portrait. Le bundle passe de ≈ 140 à ≈ 168 ko compressés : surtout `zod`, désormais chargé au démarrage pour valider la sauvegarde (Capacitor pèse ≈ 7 ko) ; `zod/mini` sera une piste si le démarrage le demande.

## D-015 — Pipeline Blender et premier animal (tâche 0.7)

- **Contexte :** produire les animaux par du code, de façon cohérente et reproductible, et refuser automatiquement un modèle qui sort des règles du GDD.
- **Décision :**
  - aucune nouvelle dépendance. Les scripts Blender n'utilisent que l'API de Blender (testés avec Blender 4.3.2). Le validateur lit lui-même le format `.glb` (en-tête et bloc JSON), et le jeu charge les modèles avec `GLTFLoader`, fourni par le paquet `three` ;
  - deux formes de base suffisent à toute la bibliothèque de pièces : une « bulle » (ellipsoïde qu'un exposant rend plus ou moins carré : corps en tonneau, museau carré) et un « membre » (cylindre effilé entre deux points). Le rendu est à facettes (ombrage plat), fidèle au style fait main du GDD ;
  - les descriptions d'espèce (`tools/blender/species/*.json`) sont écrites dans les axes du jeu (Y en haut, Z vers l'avant, mètres). La conversion vers les axes de Blender se fait à un seul endroit (`parts.py`) ;
  - palette partagée : une image de 64 × 64 px (grille de 8 × 8 cases de couleur), filtrage au plus proche, un seul matériau `palette` mat, faces arrière non dessinées. Chaque face pointe vers le centre de sa case ;
  - squelette simple, et chaque pièce suit un seul os à 100 % (liaison rigide : nette en low-poly, triviale à vérifier, peu coûteuse sur mobile). Toutes les pièces sont fusionnées en un seul maillage, donc un seul appel de dessin par animal ;
  - animations à 30 images par seconde, qui se terminent sur leur pose de départ : `idle` (4 s : deux respirations, un clignement, une oreille qui bouge, un léger hochement) et `walk` (1 s : pattes en diagonale, petit rebond du corps). Elles sont exportées par actions, une animation glTF par action ;
  - pelage irrégulier : une part des facettes (22 %) prend une teinte voisine. Le tirage dépend de la position de chaque facette et d'une graine fixe, et les faces et sommets sont triés par position avant l'export : Blender ne garde pas le même ordre d'une exécution à l'autre. Deux générations donnent ainsi exactement le même fichier ;
  - règles vérifiées par `npm run assets:check` (ajouté à `npm run check`), pour chaque `.glb` de `assets/models` : 1 500 à 4 000 triangles (budget « animal près » du GDD), animations `idle` et `walk` présentes, exactement une image et une texture, seul le matériau `palette` autorisé et présent sur chaque primitive, aucun nœud mis à l'échelle, longueur mesurée égale à `lengthM` de la description à ±10 %. Chaque modèle doit avoir sa description, et inversement. La CI vérifie les `.glb` versionnés sans avoir besoin de Blender ;
  - la configuration Vitest inclut aussi `tools/**/*.test.ts`, pour tester le validateur (validé par le propriétaire du dépôt). Le seuil de couverture reste limité à `src/sim` et `src/save` ;
  - capybara : 1,1 m de long, 2 308 triangles. Ses traits signatures : museau carré et profond, corps en tonneau, tête rectangulaire sans cou, petites oreilles hautes, yeux et narines sur le dessus de la tête, une oreille légèrement plus basse. Les incisives et les grosses articulations ont été essayées puis retirées à la demande du propriétaire : peu mignonnes et pas naturelles ;
  - en attendant que la simulation place les animaux, `render` affiche un capybara de démonstration au centre du parc, de trois quarts, en `idle` (`DEMO_ANIMAL` dans `park-view.ts`). `createAnimalSlot` gère le chargement : l'animal n'apparaît qu'une fois chargé, une animation manquante ou un téléchargement raté est signalé sans bloquer le jeu, et un modèle arrivé après la fermeture de la scène est libéré.
- **Conséquences :** le contour sombre et l'ombrage en trois tons de la direction artistique ne sont pas encore faits : le capybara utilise l'éclairage standard de Three.js. Le `.glb` pèse ≈ 307 ko, surtout à cause des sommets dédoublés par l'ombrage plat et des animations échantillonnées à chaque image : la quantification et la simplification des animations seront à étudier avant 160 espèces. Le modèle simplifié pour la vue de loin (300 à 800 triangles) n'existe pas encore. Le jeu passe de ≈ 168 à ≈ 194 ko compressés, à cause de `GLTFLoader`.

## D-016 — Développement entièrement avec Claude Code pour l'instant

- **Contexte :** simplifier la méthode de travail ; un seul outil, un seul jeu de règles.
- **Décision :** toutes les tâches et toutes les relectures se font avec Claude Code. La relecture se fait dans une nouvelle session, qui n'a pas écrit le code.
- **Conséquences :** le quota Claude devient la ressource limitante : une tâche par session, lecture minimale du dépôt, modèle plus léger pour le contenu répétitif. `AGENTS.md` reste lisible par d'autres outils si on en ajoute plus tard.

## D-017 — Délégation à des sous-agents de modèles moins chers

- **Contexte :** le propriétaire travaille avec Claude Code sur Opus, qui consomme vite le quota. Une grande partie du travail (outillage, rendu, interface, contenu répétitif, lancement des vérifications) ne demande pas la puissance d'Opus.
- **Décision :** Opus reste le chef d'orchestre : il lit le brief, propose le plan, écrit lui-même le cœur critique (simulation, gacha, économie, sauvegarde, schémas de données) et rédige le rapport final. Il délègue le reste à cinq sous-agents définis dans `.claude/agents/` : `executant` (Sonnet) pour écrire le code d'un plan validé, `contenu` (Haiku) pour le contenu répétitif, `verificateur` (Haiku) pour lancer `npm run check` et résumer, `Explore` (Haiku) pour la recherche dans le dépôt, `relecteur` (Opus) pour relire chaque branche. Un sous-agent ne lance jamais d'autres sous-agents. Cette décision complète D-016 : la relecture reste faite par un contexte qui n'a pas écrit le code, mais c'est désormais le sous-agent `relecteur`, sans nouvelle session.
- **Conséquences :** les sous-agents comptent dans le même quota que la session principale, mais Sonnet et Haiku en consomment moins qu'Opus. La relecture reste sur Opus, car c'est le garde-fou qualité. Les longs journaux de test restent hors du contexte du chef. Le chef doit écrire des messages de délégation complets (section du brief, fichiers exacts, critères d'acceptation), car un sous-agent ne voit pas la conversation. L'utilisateur ouvre une seule session par tâche. Les règles détaillées sont dans la section « Délégation aux sous-agents » de `CLAUDE.md`.
