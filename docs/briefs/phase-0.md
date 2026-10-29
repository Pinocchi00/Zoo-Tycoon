# Brief — Phase 0 : Fondations

**Objectif de la phase :** un dépôt propre et blindé, où il est impossible de fusionner du code cassé, avec un parc vide en 3D qui tourne à 60 images par seconde sur ton téléphone et un premier animal généré par Blender.

**Porte de sortie (tout doit être vrai avant la phase 1) :**

- [ ] `npm run check` est vert sur `main`.
- [ ] La CI GitHub est verte et bloque toute fusion rouge.
- [ ] Une violation d'architecture volontaire (import de `three` dans `src/sim`) est bien refusée par le linter.
- [ ] La simulation avance de façon déterministe, testée.
- [ ] La sauvegarde fait l'aller-retour, migre et résiste à un fichier corrompu, testée.
- [ ] Le parc vide tourne sur ton téléphone Android (navigateur, puis application installée).
- [ ] Le pipeline Blender produit un capybara `.glb` validé automatiquement et affiché dans la scène.

**Outil :** toute la phase 0 se fait avec **Claude Code**. Claude Code tourne sur Opus et joue le rôle de chef : il planifie, écrit le cœur critique et relit. Il délègue l'exécution à des sous-agents de modèles moins chers (voir la section « Délégation aux sous-agents » de `CLAUDE.md`). La relecture est faite par le sous-agent `relecteur`, qui n'a pas écrit le code.

---

## Avant de commencer (à faire toi-même, une seule fois)

1. Installer sur ton PC : **Git**, **Node.js** (version LTS), **Visual Studio Code** (pour regarder les fichiers), et plus tard **Android Studio** (tâche 0.6) et **Blender** (tâche 0.7).
2. Créer sur GitHub un dépôt **privé** nommé `zoo-refuge`, sans README.
3. Le cloner sur ton PC, puis y copier ces fichiers en respectant les dossiers :
   - `AGENTS.md` et `CLAUDE.md` à la racine ;
   - `docs/decisions.md` ;
   - `docs/briefs/phase-0.md` (ce fichier).
4. Exporter le document de conception en Markdown depuis Claude et l'enregistrer sous `docs/gdd.md`.
5. Premier commit : `chore: add project rules and design docs`, puis pousser sur `main`.

---

## Comment lancer chaque tâche

Pour chaque tâche ci-dessous :

1. Ouvre **une** nouvelle session Claude Code (Opus) dans le dossier du dépôt.
2. Colle le **prompt** de la tâche, tel quel.
3. Claude propose un plan : lis-le, réponds « OK » ou corrige.
4. Ensuite, Claude (le chef) fait tout seul : il délègue l'écriture aux sous-agents ou l'écrit lui-même selon le tableau ci-dessous, fait lancer les vérifications, puis fait relire la branche par le sous-agent `relecteur` et corriger les points Bloquant et À corriger.
5. À la fin, lis seulement le rapport final et vérifie que la CI est verte.
6. Fusionne dans `main` seulement si la CI est verte et que le rapport ne signale aucun point bloquant.

Tu n'as plus besoin d'ouvrir une session séparée pour la relecture. Si tu veux quand même une seconde relecture, voir la section « Relecture manuelle (facultative) » en bas de ce fichier.

Ne lance jamais deux tâches en même temps.

### Qui écrit le code

| Tâche | Qui écrit le code |
| --- | --- |
| 0.1 Socle du projet | `executant` |
| 0.2 Intégration continue et test de démarrage | `executant` |
| 0.3 Cœur de la simulation | le chef (Opus) |
| 0.4 Sauvegarde blindée | le chef (Opus) |
| 0.5 Le parc vide en 3D | `executant` |
| 0.6 Application Android | `executant` |
| 0.7 Pipeline Blender et premier animal | `executant` (le chef conçoit l'architecture des scripts) |

---

## Tâche 0.1 — Socle du projet

**But :** la structure, les outils et les garde-fous. Aucun code de jeu.

**Contenu attendu :**

- Projet Vite + TypeScript, dépendances en versions exactes (dernières versions stables au moment de l'installation).
- `tsconfig.json` au plus strict : `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`. Alias `@/` vers `src/`.
- ESLint en configuration « flat » avec les règles strictes typées de typescript-eslint, plus :
  - `switch-exhaustiveness-check`, `no-floating-promises`, `consistent-type-imports`, `no-non-null-assertion`, interdiction de `any` ;
  - `no-console` (sauf dans le logger de `src/shared`) ;
  - interdiction de `eslint-disable` sans justification (`eslint-comments/require-description` ou équivalent intégré) ;
  - **frontières d'architecture** : dans `src/sim`, `src/data`, `src/save`, `src/shared`, interdire les imports de `three`, `preact`, `@capacitor/*` et des dossiers `render`, `audio`, `ui`, `platform`, `app` ; interdire `Math.random`, `Date`, `performance`, `window`, `document`, `localStorage` ;
  - dans `src/render`, `src/audio`, `src/ui` : interdire de s'importer entre eux.
- Prettier, avec vérification dans `npm run check`.
- Vitest, avec couverture : seuil de 90 % des lignes sur `src/sim` et `src/save` (le seuil s'applique dès qu'il y a du code).
- Arborescence complète de `AGENTS.md`, chaque dossier avec un `index.ts` minimal.
- `src/shared` : type `Result<T, E>` avec fonctions `ok` / `err`, identifiants typés (« branded types »), logger de développement silencieux en production. Tous testés.
- `src/i18n` : `fr.ts` et `en.ts` typés de sorte qu'une clé manquante dans une langue soit une **erreur de compilation**. Une fonction `t(key)`.
- Scripts npm : `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:coverage`, et **`check`** qui enchaîne `typecheck`, `lint`, `format:check`, `test:coverage`, `build`.
- `.nvmrc` avec la version de Node, `.editorconfig`, `.gitignore` complet.
- `README.md` court : comment installer, lancer, vérifier.

**Critères d'acceptation :**

- `npm run check` est vert.
- Preuve des frontières : Claude ajoute temporairement `import * as THREE from 'three'` et `Math.random()` dans `src/sim/index.ts`, montre que `npm run lint` échoue avec le bon message, puis retire ces lignes.
- Preuve i18n : une clé présente en `fr` et absente en `en` fait échouer `npm run typecheck` (démontré puis annulé).

**Hors périmètre :** Three.js dans la page, simulation, CI.

**Prompt à coller :**

```
Lis AGENTS.md puis docs/briefs/phase-0.md, section "Tâche 0.1 — Socle du projet".
Réalise uniquement la tâche 0.1, sur une branche chore/project-foundation.
Commence par me proposer un plan (fichiers, dépendances avec leurs rôles, configuration) et attends mon OK.
Ensuite, fais les deux preuves demandées (frontières d'architecture et i18n) et montre-moi les sorties.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check entièrement vert et le rapport final au format d'AGENTS.md.
```

---

## Tâche 0.2 — Intégration continue et test de démarrage

**But :** GitHub refuse automatiquement tout code cassé.

**Contenu attendu :**

- `.github/workflows/ci.yml` : sur chaque push et chaque pull request, installation propre (`npm ci`), puis `npm run check`, puis les tests Playwright.
- Cache npm, durée de CI raisonnable.
- Playwright (Chromium seul pour l'instant), un test `tests/e2e/boot.spec.ts` : la page se charge, un élément `canvas` ou un conteneur racine est présent, **aucune erreur ni avertissement dans la console**.
- Script `npm run e2e`.
- Section du README expliquant comment activer la protection de branche sur `main` (fusion seulement si la CI est verte). C'est toi qui cliques dans GitHub : Claude t'écrit les étapes exactes.

**Critères d'acceptation :**

- La CI passe sur la branche.
- Preuve : un commit temporaire qui casse un test fait échouer la CI, puis il est annulé.

**Prompt à coller :**

```
Lis AGENTS.md puis docs/briefs/phase-0.md, section "Tâche 0.2".
Réalise uniquement la tâche 0.2, sur une branche chore/ci.
Propose d'abord ton plan et attends mon OK.
À la fin, donne-moi les étapes exactes, clic par clic, pour activer la protection de la branche main sur GitHub.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check et npm run e2e verts, puis le rapport final.
```

---

## Tâche 0.3 — Cœur de la simulation

**But :** la colonne vertébrale du jeu, pure, déterministe et testée. Pas encore de règles de zoo.

**Contenu attendu (dans `src/sim`) :**

- **Générateur aléatoire à graine** : algorithme xoshiro128** initialisé par splitmix32, état stocké dans l'état du jeu (4 entiers 32 bits). Fonctions : entier dans un intervalle, flottant dans [0, 1), choix pondéré par des entiers, mélange. Tests : même graine = même suite ; distribution uniforme vérifiée statistiquement sur 1 000 000 de tirages ; choix pondéré conforme à 0,1 point près.
- **État du jeu** `GameState` : objet sérialisable en JSON, avec version, horloge du jeu (millisecondes entières), état du générateur, monnaies (entiers), listes vides prêtes pour les enclos et les animaux.
- **Temps** : `advance(state, deltaMs)` avec accumulateur et pas fixe de 100 ms ; `catchUp(state, offlineMs)` par pas grossiers d'une minute, plafonné à 12 heures de jeu effectif. Tests : avancer 1 000 fois 16 ms ou 1 fois 16 000 ms donne le même état ; le plafond est respecté.
- **Commandes** : union discriminée `Command`, fonction `applyCommand(state, command): Result<...>`. Une seule commande de démonstration (`addCoins`, réservée au développement) pour prouver le mécanisme.
- **Événements** : file d'événements typés, vidée par le lecteur à chaque image.
- **Simulateur en ligne de commande** `tools/sim/run.ts` : `npm run sim -- --days 7 --seed 42` affiche un résumé (durée simulée, temps de calcul). Pour l'instant il n'y a rien à simuler, mais l'outil existe.

**Critères d'acceptation :**

- Couverture ≥ 90 % sur `src/sim`.
- Test de déterminisme : deux parties à la même graine avec les mêmes commandes produisent un état identique, octet pour octet, après 30 jours simulés.
- `npm run check` vert.

**Prompt à coller :**

```
Lis AGENTS.md, docs/decisions.md puis docs/briefs/phase-0.md, section "Tâche 0.3".
Réalise uniquement la tâche 0.3, sur une branche feat/sim-core.
Avant de coder, propose-moi les types principaux (GameState, Command, GameEvent, l'API du générateur et d'advance) et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Écris les tests en même temps que le code. Termine par npm run check vert, la sortie de npm run sim -- --days 7 --seed 42, puis le rapport final.
```

---

## Tâche 0.4 — Sauvegarde blindée

**But :** une sauvegarde qui ne se perd jamais et qui survit aux mises à jour du jeu.

**Contenu attendu :**

- `src/save` (pur) : `serialize(state)` et `deserialize(text): Result<GameState, SaveError>`. Validation complète par un schéma zod. Enveloppe : version de format, date d'écriture fournie de l'extérieur, somme de contrôle du contenu.
- **Migrations** : registre ordonné `v1 → v2 → …`. Une migration factice v0 → v1 pour prouver le mécanisme.
- `src/platform/storage` : interface `SaveStorage` (lire, écrire, lister les copies) avec une implémentation navigateur (IndexedDB, repli `localStorage`). L'implémentation Capacitor viendra en 0.6.
- **Écriture sûre** : on écrit dans un emplacement temporaire, on relit et on valide, puis on remplace. On garde les 3 dernières sauvegardes valides.
- **Chargement résilient** : si la sauvegarde principale est corrompue, on charge la copie valide la plus récente et on émet un événement qui permettra d'informer le joueur gentiment.

**Critères d'acceptation, tous testés :**

- Aller-retour : `deserialize(serialize(state))` redonne exactement l'état.
- Migration depuis la version factice.
- Fichier tronqué, JSON invalide, somme de contrôle fausse, champ manquant : aucun plantage, erreur typée, repli sur la copie.
- Couverture ≥ 90 % sur `src/save`.

**Prompt à coller :**

```
Lis AGENTS.md puis docs/briefs/phase-0.md, section "Tâche 0.4".
Réalise uniquement la tâche 0.4, sur une branche feat/save.
Propose d'abord le format de l'enveloppe de sauvegarde, la stratégie d'écriture sûre et la liste des tests, et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check vert et le rapport final.
```

---

## Tâche 0.5 — Le parc vide en 3D

**But :** voir et manipuler le terrain du parc sur le téléphone, avec la lumière du diorama validé.

**Contenu attendu (dans `src/render` et `src/app`) :**

- Scène Three.js, caméra **orthographique isométrique**.
- Contrôles tactiles et souris : glisser pour déplacer, pincer ou molette pour zoomer (bornes min et max), deux doigts pour tourner. Mouvements amortis, jamais brusques.
- Socle du terrain façon diorama (herbe, couches de terre visibles sur les bords), une grille invisible prête pour la construction.
- Éclairage : soleil directionnel avec ombres douces, lumière d'ambiance ciel/sol, ambiance « après-midi » par défaut.
- Niveaux de qualité (bas, moyen, haut) détectés au premier lancement par un court test, modifiables ; le niveau bas coupe les ombres douces.
- Boucle principale dans `src/app` : `requestAnimationFrame`, appel de `advance` avec le temps écoulé, rendu. Pause propre quand l'app passe en arrière-plan.
- Compteur d'images par seconde visible **en développement uniquement**.
- Gestion du redimensionnement, des zones sûres de l'écran (encoche) et de la densité de pixels plafonnée à 2.
- Aucune allocation dans la boucle de rendu.
- Le test Playwright de démarrage reste vert.

**Critères d'acceptation :**

- Test sur ton téléphone via le serveur de développement en réseau local (`npm run dev -- --host`) : fluide, contrôles agréables au doigt.
- `npm run check` et `npm run e2e` verts.

**Prompt à coller :**

```
Lis AGENTS.md puis docs/briefs/phase-0.md, section "Tâche 0.5".
Réalise uniquement la tâche 0.5, sur une branche feat/render-base.
Propose d'abord ton plan (structure de render, contrôles de caméra, niveaux de qualité) et attends mon OK.
À la fin, explique-moi comment ouvrir le jeu sur mon téléphone Android via le réseau local, étape par étape.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Termine par npm run check et npm run e2e verts, puis le rapport final.
```

---

## Tâche 0.6 — Application Android

**But :** installer le jeu sur ton téléphone comme une vraie application.

**Contenu attendu :**

- Capacitor configuré, plateforme Android ajoutée, identifiant d'application provisoire (par exemple `com.gardenofearth.zoorefuge`, à confirmer).
- Implémentation Capacitor de `SaveStorage`.
- Orientation portrait verrouillée, plein écran, barre d'état gérée, écran qui reste allumé pendant le jeu (désactivable plus tard).
- Script `npm run android` qui construit le jeu et synchronise le projet Android.
- Guide pas à pas dans `docs/android.md` : installer Android Studio, activer le mode développeur et le débogage USB sur ton téléphone, lancer l'app.

**Critères d'acceptation :**

- L'app s'installe et tourne sur ton téléphone, fluide.
- Une sauvegarde survit à la fermeture complète de l'app.

**Prompt à coller :**

```
Lis AGENTS.md puis docs/briefs/phase-0.md, section "Tâche 0.6".
Réalise uniquement la tâche 0.6, sur une branche feat/android.
Je ne suis pas développeur : écris docs/android.md pour qu'un débutant puisse suivre sans aide.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Propose d'abord ton plan et attends mon OK. Termine par npm run check vert et le rapport final.
```

---

## Tâche 0.7 — Pipeline Blender et premier animal

**But :** prouver qu'on peut produire des animaux cohérents par le code, et qu'un mauvais modèle est refusé automatiquement.

**Contenu attendu :**

- `tools/blender/` : scripts Python lancés sans interface (`blender -b -P ...`).
  - Une bibliothèque de pièces paramétrées (corps, tête, museau, oreilles, pattes, queue), en style low-poly arrondi.
  - Une palette partagée (une seule petite texture de couleurs).
  - Un fichier de description du capybara (proportions, couleurs, traits signatures), d'où le script construit le modèle.
  - Squelette simple et deux animations : `idle` (respiration, clignement) et `walk`.
  - Export `.glb` dans `assets/models/capybara.glb`.
- `tools/assets/validate.ts` : vérifie chaque `.glb` (nombre de triangles dans le budget du GDD, nom des animations obligatoires, échelle, une seule texture de palette, pas de matériau inconnu). Script `npm run assets:check`, ajouté à `npm run check`.
- Le capybara est chargé et affiché dans la scène du parc, animé en `idle`.
- Guide dans `docs/blender.md` : installer Blender, lancer la génération.

**Critères d'acceptation :**

- `npm run assets:check` vert pour le capybara.
- Preuve : un modèle volontairement trop lourd ou sans animation `idle` est refusé.
- Le capybara est reconnaissable au premier coup d'œil (validation par toi).

**Prompt à coller :**

```
Lis AGENTS.md, la section "Direction artistique" et "Vie animale" de docs/gdd.md, puis docs/briefs/phase-0.md, section "Tâche 0.7".
Réalise uniquement la tâche 0.7, sur une branche feat/blender-pipeline.
Propose d'abord l'architecture des scripts Blender (pièces, palette, description d'espèce, animations) et attends mon OK.
Délègue selon la section "Délégation aux sous-agents" de CLAUDE.md, puis fais relire par le sous-agent relecteur avant le rapport final.
Fais la preuve du refus d'un mauvais modèle. Termine par npm run check vert, une capture du capybara dans la scène, et le rapport final.
```

---

## Relecture manuelle (facultative)

La relecture normale est faite par le sous-agent `relecteur`, pendant la session de la tâche. Cette section ne sert que si tu veux une seconde relecture, dans une **nouvelle** session Claude Code qui n'a pas écrit le code.

Prompt de relecture :

```
Tu es relecteur senior et tu n'as pas écrit ce code. Lis CLAUDE.md, puis docs/briefs/phase-0.md, section "Tâche X".
Relis la branche <nom-de-branche> en suivant la section "Relire une branche" de CLAUDE.md.
Réponds uniquement par trois listes : Bloquant, À corriger, Suggestion. Pour chaque point, donne le fichier, la ligne et la raison.
Ne réécris pas le code. Vérifie en particulier qu'aucun test n'a été affaibli et qu'aucune règle d'AGENTS.md n'a été contournée.
```

Si la relecture trouve des points bloquants ou à corriger, ouvre une nouvelle session Claude Code :

```
Lis AGENTS.md. Voici la relecture de la branche <nom-de-branche> : <colle la relecture>.
Corrige uniquement les points Bloquant et À corriger. Pour chaque suggestion, dis si tu l'appliques et pourquoi.
Termine par npm run check vert et le rapport final.
```
