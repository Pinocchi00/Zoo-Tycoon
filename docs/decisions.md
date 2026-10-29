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

## D-018 — Points tranchés avant la phase 1 (tâche 1.0)

- **Contexte :** la mise à jour du brief de la phase 1 a relevé huit écarts entre le brief, le GDD et le code de la phase 0. Le propriétaire les a tranchés avant la tâche 1.1 : le terrain selon sa demande, le reste selon les recommandations du chef.
- **Décision :**
  - **animations (tâche 1.7) :** `idle`, `walk`, `sleep` et `eat` deviennent obligatoires pour chaque animal, plus une animation signature déclarée dans la description d'espèce (`swim` pour le capybara). La tâche 1.7 modifie pour cela `tools/assets/model-rules.ts` et `tools/assets/species.ts`, sans toucher à la bibliothèque de pièces ;
  - **visiteurs (tâche 1.9) :** deux familles de règles de validation. Les animaux restent dans `assets/models/`, les visiteurs vont dans `assets/models/visitors/` avec leur budget (800 à 1 500 triangles) et leurs animations ;
  - **terrain (tâche 1.4) :** le parc se construit sur un terrain immense à développer, comme dans les tycoons mobiles ; le GDD (« Le terrain ») est mis à jour dans ce sens. La taille vit dans `src/data`, la simulation s'en sert pour valider, le rendu la lit. Valeur de départ : 256 × 256 cases (256 m), ajustable. Tout le terrain est constructible dans la tranche, l'achat de parcelles vient plus tard. Entrée au milieu du bord sud, deux places de parking juste à l'extérieur de part et d'autre, caméra de départ sur l'entrée ;
  - **vibrations (tâche 1.10) :** une fonction de vibration dans `src/platform` (`@capacitor/haptics` sur Android, vibration du navigateur sur le web), déclenchée par `app` sur l'événement de pose. Le rendu ne vibre jamais ;
  - **clés de texte (tâche 1.1) :** typées avec `TranslationKey` par `import type` depuis `src/i18n`. `AGENTS.md` (4.1) place `i18n` dans le graphe : il ne dépend de rien ;
  - **courrier et absence (tâche 1.6) :** `app` fournit le numéro du jour réel dans la commande de courrier, la simulation retient le dernier jour réclamé (cumul de 3 jours au plus). Au-delà de 12 h d'absence, les recettes s'arrêtent net : « plafonnées » au sens d'un gain total plafonné à 12 h, comme le fait déjà `catchUp` ;
  - **visiteurs lointains (tâche 1.5) :** `app` fournit à `advance` la zone regardée par la caméra, traitée comme une donnée d'entrée au même titre que les commandes. Un visiteur lointain est mis à jour moins souvent, avec un pas plus long. Le simulateur d'économie tourne sans zone, tous les visiteurs à pleine fréquence ;
  - **coquille :** la tâche 1.2 porte sur les 4 autres espèces.
- **Conséquences :** un terrain de 256 m oblige le rendu à ne pas tout dessiner ni tout ombrer à pleine qualité : l'ombre et le détail doivent suivre la zone visible (tâches 1.10 et 1.14, à vérifier par la mesure sur Android modeste). Avec la zone de caméra en entrée, le résultat de la simulation dépend de ce que regarde le joueur : le déterminisme reste garanti à entrées égales, mais un rejeu doit enregistrer la zone comme les commandes. `@capacitor/haptics` sera une nouvelle dépendance, justifiée par la tâche 1.10.

## D-019 — Règles de la tranche et format des données (tâche 1.1)

- **Contexte :** la tâche 1.1 décrit tout le contenu en données validées. Le brief de la phase 1 (« Règles de jeu précisées ») complète le GDD sur quatre points, et le format des données devait être fixé avant les tâches 1.2 à 1.6.
- **Décision :**
  - **taille maximale d'un groupe :** taille à l'arrivée + 3, comme valeur de départ, stockée dans chaque espèce (`group.maxSize`) et donc ajustable sans code ;
  - **palier de rareté vide :** le chargement l'accepte. Le moteur du gacha (tâche 1.3) reporte son taux sur le palier non vide immédiatement inférieur, et l'écran des taux affiche les taux réellement appliqués. Le moteur complet est testé avec `src/data/fixtures/synthetic-gacha.ts` (deux espèces par palier) ;
  - **arrivage de bienvenue :** le Très rare garanti est choisi parmi les Très rares disponibles, jusqu'à trois (`choiceCount`). Dans la tranche, il n'y en a qu'un, le jaguar ;
  - **courrier quotidien :** un ticket d'arrivage par jour réel, cumulable trois jours au maximum (mis en œuvre par la tâche 1.6, voir D-018) ;
  - **étoiles par doublons :** l'arrivage donne l'étoile 1 (le kit d'habitat), chacun des quatre premiers doublons ajoute une étoile, donc 4 doublons mènent à 5 étoiles. Tranché par le propriétaire, et le GDD (« Les doublons ne sont jamais perdus ») est corrigé dans ce sens ;
  - **catalogue du refuge :** seuls les Rares, Très rares et Emblématiques s'y achètent (150, 400, 1 000 médailles), les seuls prix donnés par le GDD ;
  - **hausse des chances d'Emblématique :** les données ne fixent que son début (70e arrivage). Sa vitesse est proposée avec l'algorithme de la tâche 1.3 ;
  - **format :** les données sont des modules TypeScript dans `src/data/content`, typés par `satisfies` avec le type d'entrée de leur schéma zod. Une clé de texte inconnue fait donc échouer la compilation ; à l'exécution, le schéma vérifie la forme et la présence de la clé, et un test de `src/app` (seul dossier qui connaît `data` et `i18n`) vérifie qu'elle existe dans les catalogues. Ce test repère les clés par leur nom de champ : tout champ de texte des données se termine par `Key` (`nameKey`, `signatureKey`…). Pas de découverte automatique des fichiers : le simulateur d'économie tourne sous Node, sans Vite ;
  - **chargement :** `loadGameData` valide chaque fichier puis les références (biome, éléments d'habitat et leur catégorie, comportements, identifiants partagés entre éléments d'habitat, bâtiments et décor), renvoie toutes les erreurs d'un coup avec leur source et leur chemin, et des `Map` dans l'ordre des fichiers pour que les tirages restent déterministes. `app` l'appelle une fois au démarrage et s'arrête avec un message clair si les données sont invalides ;
  - **données encore vides :** bâtiments et archétypes de visiteurs ont leur schéma, mais leur contenu est écrit par les tâches 1.4 et 1.5, qui en fixent les chiffres. La tranche n'a pas de décor ;
  - **valeurs inventées :** l'attractivité de base du capybara (10) et ses éléments d'étoiles 2 à 5 ne viennent pas du GDD. Ce sont des valeurs de départ, à équilibrer par la tâche 1.6 ;
  - **modèles à venir (tâche 1.2) :** `modelId` est nullable dans le schéma d'espèce, `null` voulant dire « modèle à venir ». Le pécari, le tapir, la loutre géante et le jaguar ont `modelId: null`, et `tools/assets/species-models.test.ts` ne vérifie que les modèles déclarés : c'est la seule modification hors de `src/data` et `src/i18n`, autorisée par le propriétaire. La tâche 1.7 renseignera les `modelId` de ces quatre espèces ;
  - **valeurs inventées de la tâche 1.2 :** taille d'enclos, attractivité de base (pécari 10, tapir 15, loutre géante 22, jaguar 30), kit d'habitat, éléments des étoiles 2 à 5 et comportements des quatre espèces ne viennent pas du GDD. Ils ont été validés par le propriétaire, et les attractivités sont des valeurs de départ, à équilibrer par la tâche 1.6. La loutre géante a un enclos M, et non S comme les « loutres » du GDD, à cause de sa taille (environ 1,7 m) ;
  - **identifiants :** `BiomeId`, `BannerId`, `BehaviorId`, `ArchetypeId` rejoignent `src/shared/brand.ts`. Éléments d'habitat, bâtiments et décor partagent `ItemId`. `src/data` importe les fichiers précis de `src/shared` (pas son index, qui contient le logger lié à Vite) pour rester utilisable depuis `tools`.
- **Conséquences :** ajouter une espèce demande un fichier dans `src/data/content/species`, une ligne dans leur liste et ses textes dans `src/i18n`, sans toucher au code de jeu. Le lien entre un comportement et son animation est laissé à la tâche 1.8.

## D-020 — Moteur du gacha (tâche 1.3)

- **Contexte :** la tâche 1.3 écrit le système d'arrivages. Le GDD et D-019 laissaient ouverts l'ordre des garanties, la vitesse de la hausse d'Emblématique, le sort des garanties d'un palier vide et le moment du choix de bienvenue. Le propriétaire a validé les propositions ci-dessous.
- **Décision :**
  - **compteurs :** un compteur par garantie (`arrivalsSince.rare`, `.veryRare`, `.iconic`), qui compte les arrivages depuis le dernier résultat de ce palier ou d'un palier plus rare. Ils vivent dans `state.gacha` et servent à toutes les bannières ;
  - **ordre :** à chaque arrivage, la garantie la plus rare qui tombe l'emporte (Emblématique au 90ᵉ, puis Très rare au 40ᵉ, puis Rare au 10ᵉ). Sous une garantie, le palier est tiré parmi les paliers égaux ou plus rares avec leurs poids habituels, si bien que l'Emblématique garde sa chance. Si ces paliers ont des espèces mais un taux nul, la garantie se partage à parts égales ;
  - **hausse d'Emblématique :** rampe linéaire déduite des données, sans nouveau paramètre : `taux + (100 % − taux) × (n − 69) / 21` du 70ᵉ au 89ᵉ arrivage (5,71 % au 70ᵉ, 52,85 % au 80ᵉ), arrondie vers le bas en points de base. Les autres paliers se partagent le reste au prorata de leurs taux, avec des poids entiers exacts ;
  - **palier vide :** son taux va au palier non vide immédiatement inférieur (au plus proche au-dessus s'il n'y en a aucun en dessous). Une garantie sans aucune espèce à son niveau ou au-dessus dort : pas de hausse, pas de garantie, compteur gelé, pour que l'ajout de contenu ne donne jamais un Emblématique immédiat. `appliedRarityRates` donne les taux réellement appliqués pour l'écran des taux. Dans la tranche : Très rare 6 %, Emblématique 0 % ;
  - **bienvenue :** 20 arrivages sur cette bannière, sans limite de temps. Le 20ᵉ est toujours le Très rare garanti : la simulation tire jusqu'à `choiceCount` espèces différentes du palier (ou de son remplaçant s'il est vide), émet `welcomeChoiceOffered`, et la commande `chooseWelcomeSpecies` livre l'espèce choisie, qui compte comme un arrivage. Un lot de 10 qui dépasserait les 20 est refusé ;
  - **doublons (D-019) :** chaque doublon ajoute une étoile jusqu'à 5 et, en parallèle, un individu jusqu'à `group.maxSize`. Quand les deux sont déjà au maximum, il donne `medalsPerExtraDuplicate` (50) en plus des `medalsPerArrival` (10) ;
  - **catalogue :** `adoptFromCatalog` agit comme un doublon, sans médailles d'arrivage et sans effet sur les compteurs. Il refuse une espèce déjà complète, qui coûterait plus qu'elle ne rapporte ;
  - **interface de la simulation :** `applyCommand(state, command, data, events)` reçoit désormais `GameData`. Événements `arrivalsStarted`, `arrivalOpened` et `welcomeChoiceOffered`. L'historique complet est dans `state.gacha.history`. Les espèces reçues sont dans `state.gacha.collection` ; leur installation dans un enclos revient à la tâche 1.4 ;
  - **sauvegarde :** `STATE_VERSION = 2`, avec une migration v1 → v2 qui ajoute `gacha` vide.
- **Conséquences :** sur un million d'arrivages, les taux consolidés observés (garanties comprises) sont d'environ 52,7 / 25,8 / 13,6 / 5,9 / 2,0 %. L'écran des taux pourra les afficher à côté des taux de base. Les variantes rares (0,5 %) et le déblocage des espèces par le niveau du parc ne sont pas encore traités : dans la tranche, toutes les espèces sont disponibles.

## D-021 — Construction du parc (tâche 1.4)

- **Contexte :** la tâche 1.4 écrit la simulation de tout ce qu'on pose dans le parc. Le GDD laissait ouverts la forme d'un enclos libre, son prix, les chiffres des bâtiments (D-019), la formule de la note de vue et la place de l'annulation. Le propriétaire a validé les propositions ci-dessous ; les enclos sont gratuits, l'habitat arrivant avec les animaux du gacha.
- **Décision :**
  - **terrain (D-018) :** `src/data/content/terrain.ts`, 256 × 256 cases, la rangée 0 au nord. Entrée de 8 × 3 cases au milieu du bord sud (colonnes 124 à 131, rangées 253 à 255), deux parkings de 12 × 10 m juste à l'extérieur de part et d'autre. Le chargement vérifie ces positions (parkings collés au bord sud) et que la surface maximale d'un enclos admet la taille XL. L'entrée compte comme une allée. `STARTING_PARK_GRID` quitte `src/render` : `app` passe au rendu la taille du terrain et le centre de l'entrée, où démarre la caméra ;
  - **occupation des cases :** jamais sauvegardée. La sauvegarde ne garde que les listes d'objets ; `buildOccupancy` reconstruit un `Int32Array` à chaque commande, et `app` pourra en garder un pour les aperçus ;
  - **enclos à forme libre :** un contour de 3 à 32 sommets entiers sur les coins de la grille, simple (sans croisement), dans le terrain. Ses cases sont celles dont le centre est dedans (calcul entier en coordonnées doublées ; un centre posé exactement sur une arête oblique compte quand l'enclos est à l'ouest de l'arête). Surface = nombre de cases, au moins S (16) à la pose et la taille de l'espèce à l'installation, au plus 1 024 ; les cases doivent se toucher par un côté. Pas d'épaisseur minimale. Déplacement : translation et quarts de tour autour du coin nord-ouest de son cadre. La règle du centre sur une arête oblique ne suit pas la rotation : un quart de tour peut ôter quelques cases, et un enclos juste à la taille minimale peut alors voir sa rotation refusée (`enclosureTooSmall`) ;
  - **prix :** enclos gratuits ; allées de 1 à 4 pièces par case (terre battue, gravier, pavés, platelage) ; banc 30, poubelle 15, fontaine 40, kiosque à glaces 200, toilettes 250, tous reliés à une allée. Remboursement à 100 % du prix actuel des données (`refundRateBp`). Valeurs de départ, à équilibrer par la tâche 1.6 ;
  - **allées et bâtiments :** un bâtiment est relié s'il touche par un côté une case d'allée ou d'entrée. Retirer une allée reste permis même si un bâtiment se retrouve isolé : savoir s'il est atteignable revient aux visiteurs (tâche 1.5) ;
  - **groupes :** une espèce par enclos dans la tranche (`speciesId`). Taille du groupe et étoiles restent lues dans `state.gacha.collection`. Installer un groupe déjà logé le déménage ; un enclos déplacé emmène son groupe ; un enclos supprimé le renvoie au refuge ;
  - **note de vue :** de 0 à 5, stockée sur l'enclos et recalculée après chaque commande de construction et d'arrivage. Pour chaque case du bord, d est la distance de Tchebychev (au plus R = 4) de la case d'allée ou d'entrée la plus proche dont la ligne (Bresenham) ne traverse ni bâtiment ni autre enclos ; elle vaut (R + 1 − d) × 10 000 / R points de base, 0 si rien ne la voit. La moyenne sur le bord donne ⌊couverture × 4 / 10 000⌋, plus 1 si les étoiles du groupe ont débloqué un élément `viewpoint` et que l'enclos est vu. Le bonus ne s'applique pas à un enclos que personne ne voit (précision ajoutée en écrivant le code) ;
  - **annuler et rétablir :** chaque commande de construction enregistre un `ParkChange` (objets avant et après, écart exact de pièces) dans `state.session.buildHistory`. `undoBuild` applique l'inverse, `redoBuild` le changement ; les deux passent par la même validation que les commandes. Historique illimité, jamais sauvegardé (`toSavedState` le retire, le chargement repart d'une session vide). Les identifiants ne sont jamais réutilisés : annuler ne recule pas `nextIds`, si bien qu'annuler puis rétablir redonne exactement le même état. Les commandes d'arrivage ne s'annulent pas et ne touchent pas l'historique ; une annulation impossible (pièces dépensées ailleurs) est refusée avec une erreur typée et reste disponible ;
  - **événements :** les poses et déplacements (`pathTilesChanged`, `enclosurePlaced`, `enclosureMoved`, `buildingPlaced`, `buildingMoved`) portent leur cause (`command`, `undo`, `redo`), pour que `app` ne fasse vibrer que les vraies poses ;
  - **erreurs :** `BUILD_ERRORS`, texte `build.error.<code>` en fr et en, vérifié par un test de `src/app` ;
  - **sauvegarde :** `STATE_VERSION = 3`, avec une migration v2 → v3 qui ajoute allées, bâtiments et compteurs vides et refuse une liste d'enclos non vide, impossible en v2. Le schéma vérifie que chaque identifiant d'enclos ou de bâtiment est inférieur à son compteur (sinon la pose suivante créerait un jumeau) et borne grossièrement les contours (256 sommets, coordonnées ≤ 65 535) pour qu'un fichier modifié à la main ne bloque pas le chargement.
- **Conséquences :** la tâche 1.10 dessine les enclos à partir de `outlineCells` (mêmes cases que la simulation) et branche la vibration sur les événements `…Placed`. Sur un terrain de 256 m, la hauteur maximale de la caméra (72 m) ne montre plus tout le parc : à revoir par la tâche 1.10. L'attractivité selon la surface d'un enclos gratuit est à équilibrer par la tâche 1.6.

## D-022 — Visiteurs, simulation (tâche 1.5)

- **Contexte :** la tâche 1.5 fait vivre les visiteurs dans la simulation. Le GDD donne la formule de fréquentation, les besoins et le principe « une baisse ne punit jamais », mais pas le modèle d'un visiteur, l'algorithme de chemin, les chiffres des besoins ni la forme de l'API des visiteurs lointains (D-018, point 7). Le propriétaire a validé le plan ci-dessous.
- **Décision :**
  - **un visiteur = un groupe** d'un archétype (famille, couple…), avec sa taille. Il est sauvegardé (`state.visitors.list`) et mis à jour sur place. Sa position est une case, la case suivante et une progression entière en millimètres, que le rendu interpole ;
  - **contexte de pas :** `advance(state, deltaMs, context, events)` et `catchUp(…, context, …)`. `SimContext` (créé par `createSimContext(data)`) porte les données, la zone regardée (`focus`, ou `null`) et le cache des chemins. Il vit hors de l'état, si bien que l'état reste du JSON simple. Les systèmes reçoivent le contexte : `System = (state, stepMs, context, events)` ;
  - **chemins :** recherche en largeur sur les cases marchables (allées et entrée, 4 voisins), sous forme de champs de distance multi-sources : un pour la sortie, un par besoin (tous les services qui y répondent) et un par enclos (les cases d'allée qui le voient, mêmes règles de vue que D-021). Le visiteur passe au voisin plus proche dans l'ordre nord, est, sud, ouest. Les champs sont calculés à la demande et jetés quand le plan change : le cache retient les listes d'allées, d'enclos et de bâtiments dont il est issu, et chaque modification du parc les remplace (comme le chargement d'une partie). Rien n'est ajouté à l'état, si bien qu'annuler puis rétablir redonne toujours exactement le même état (D-021). Le cache ne change jamais un résultat ;
  - **pas de collision** entre visiteurs dans la simulation : une allée d'une case ne peut pas se bloquer (testé avec 250 groupes). La densité est réglée par la capacité ; l'évitement est visuel (tâche 1.9) ;
  - **toujours une sortie :** un visiteur dont la case n'est plus une allée, ou qui ne peut plus rejoindre l'entrée, quitte le parc aussitôt (`visitorLeft` avec `lost: true`, pour que le rendu le fasse disparaître en douceur) ;
  - **arrivées :** `V = min(k × √A, capacité)`, avec `A_enclos = A_espèce × (1 + 0,2 × étoiles) × (1 + 0,1 × vue)` et sans bonus de quartier dans la tranche. Seuls les enclos habités et vus depuis une allée reliée à l'entrée comptent. Calcul en millièmes entiers ; un accumulateur entier fait entrer les groupes. Capacité : au plus `maxPerMinute` (30) par minute et `maxPresent` (250) présents, et une case marchable sur deux au plus ;
  - **besoins :** faim et soif, repos, confort, en millièmes de point de base pour qu'un pas de 100 ms les fasse bouger. Ils montent de 800, 1 000 et 600 points de base par minute, ×1,5 pour les besoins voulus par l'archétype. Au-dessus de 6 000, le visiteur va au service le plus proche, s'en sert, paie, et le besoin retombe à 0. Si aucun service n'est accessible, le manque est compté une fois par visite dans le fil de suggestions (`serviceMissed`) ;
  - **émerveillement et arrêts :** le prochain enclos est tiré par attractivité parmi ceux pas encore vus, puis parmi tous sauf le dernier. Arrêt de 10 s + 4 s par point de vue ; gain d'émerveillement de 1 500 + 300 par point de vue (×1,5 si l'archétype le veut) ;
  - **satisfaction :** cible = 60 % + 40 % de l'émerveillement − 50 % de l'excès de chaque besoin au-dessus du seuil, lissée avec une constante de 60 s (un pas d'une minute réduit l'écart de moitié, contre environ 63 % pour 600 pas de 100 ms : même ordre de grandeur hors ligne). La dépense vaut `prix × taille du groupe × (80 % + 20 % × satisfaction)` : une baisse rogne seulement les dépenses. Le parc garde la moyenne lissée des départs (`parkSatisfactionBp`, poids 1/20), que la tâche 1.6 utilisera ; `satisfactionByZone` donne la moyenne par carrés de 16 m ;
  - **bulles :** `visitorThoughtKey` choisit une clé de texte des données selon l'état (manque, besoin en cours, émerveillement, départ, contentement). `suggestionFeed` trie les manques par fréquence ; les compteurs sont divisés par deux toutes les 10 minutes de jeu ;
  - **visiteurs lointains (D-018, point 7) :** `app` écrit à chaque image dans `context.focus` le rectangle de cases vu par la caméra (le disque circonscrit à l'emprise au sol, avec 25 % de marge, pour rester juste quand la caméra tourne). Hors de cette zone, un visiteur est mis à jour un pas sur 5, à tour de rôle selon sa place dans la liste, avec tout le temps écoulé depuis sa dernière mise à jour (`updatedAtMs`) : il ne prend jamais de retard. Le simulateur d'économie, le rattrapage hors ligne et les tests tournent avec `focus = null`, donc tout le monde à pleine fréquence. Chaque mise à jour découpe son temps entre marche, arrêts et services, si bien qu'un pas d'une minute donne une visite du même ordre (testé à ±20 % de départs et ±30 % de recettes sur une heure) ;
  - **données :** `visitorRules` (`src/data/content/visitor-rules.ts`, schéma `src/data/schemas/visitors.ts`), les 5 archétypes de la tranche (vitesse, durée de visite, besoins voulus), et `visitorUse` sur chaque bâtiment (durée, prix). Valeurs de départ, à équilibrer par la tâche 1.6 : k = 2, kiosque à glaces 6 pièces par personne, autres services gratuits ;
  - **sauvegarde :** `STATE_VERSION = 4`, avec une migration v3 → v4 qui ajoute une foule vide dont le fil de suggestions décroît à partir de l'heure de la sauvegarde. Le schéma vérifie chaque visiteur (case suivante voisine, progression, niveaux bornés, listes sans doublon), que son identifiant a bien été émis et que ni lui ni la dernière décroissance ne sont en avance sur l'horloge. Toutes les demi-vies écoulées s'appliquent d'un coup, si bien qu'un long écart ne fait jamais tourner de boucle, et un visiteur sauvegardé hors du terrain quitte le parc ;
  - **performance :** 250 visiteurs en 0,2 ms environ par pas de 100 ms sur le PC de développement (`tools/sim/visitor-performance.test.ts`, limite à 2 ms ; jusqu'à 1,3 ms quand toute la suite de tests tourne en parallèle). Le test est dans `tools` parce que `performance` est interdit dans `src/sim`.
- **Conséquences :** la tâche 1.6 règle k, les prix, l'entrée et la durée de visite selon la satisfaction (pas encore appliquée : la durée vient seulement de l'archétype). La tâche 1.9 dessine les visiteurs à partir de leur case, de la case suivante et de `progressMm`, et réagit à `visitorArrived` et `visitorLeft`. Les besoins « amusement » et « orientation » du GDD restent hors tranche.
