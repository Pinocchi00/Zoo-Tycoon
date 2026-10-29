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
