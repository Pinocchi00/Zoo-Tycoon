# AGENTS.md — Zoo Refuge (nom provisoire)

Ce fichier est la loi du dépôt. Toute IA qui travaille ici (Claude Code, Codex, OpenCode ou autre) le lit en entier avant de commencer et le respecte sans exception. En cas de conflit entre une demande et ce fichier, l'agent s'arrête et signale le conflit au lieu de choisir seul.

---

## 1. Le projet

Tycoon de zoo mobile, calme et chaleureux. Le joueur accueille des animaux secourus via des arrivages (gacha gratuit, jamais payant) et aménage un parc pour que les visiteurs passent une belle journée.

- **Design :** `docs/gdd.md` est la source de vérité. Ne jamais inventer une règle de jeu qui n'y figure pas : demander.
- **Décisions techniques :** `docs/decisions.md`. Toute décision structurante y est ajoutée.
- **Tâches :** `docs/briefs/`. Un agent ne travaille que sur la tâche décrite dans le brief qu'on lui donne.

---

## 2. Stack technique

Ne rien changer à cette liste sans une décision écrite dans `docs/decisions.md`.

| Besoin | Choix |
| --- | --- |
| Langage | TypeScript, mode strict maximal |
| Rendu 3D | Three.js |
| Interface | Preact (composants légers, au-dessus du canvas) |
| Construction | Vite |
| Application mobile | Capacitor (Android d'abord, iOS ensuite) |
| Validation des données | zod |
| Tests unitaires | Vitest |
| Tests de bout en bout | Playwright |
| Qualité | ESLint (typescript-eslint, règles strictes typées) + Prettier |
| Gestionnaire de paquets | npm, avec `package-lock.json` versionné |
| Modèles 3D | Scripts Blender (Python, mode sans interface) exportant du glTF binaire (`.glb`) |

Règles de dépendances :

- Versions **exactes** dans `package.json` (jamais de `^` ni de `~`).
- Aucune nouvelle dépendance sans une ligne dans `docs/decisions.md` expliquant pourquoi elle est nécessaire et pourquoi le code maison ne suffit pas.
- Préférer zéro dépendance à une petite dépendance.

---

## 3. Arborescence

```
src/
  shared/    Types et utilitaires purs (math, identifiants typés, Result). Ne dépend de rien.
  data/      Contenu du jeu décrit en données : espèces, objets, taux, textes. Schémas zod.
  sim/       Simulation pure : état, systèmes, temps, hasard, gacha, économie, commandes, événements.
  save/      Sérialisation, versions de sauvegarde, migrations. Pur.
  render/    Three.js : scène, caméra, lumière, post-traitement, modèles, animations.
  audio/     Web Audio : ambiances, musique, sons d'interface.
  ui/        Interface Preact : bandeaux, menus, écrans.
  platform/  Accès au monde extérieur : stockage, vibrations, cycle de vie de l'app, Capacitor.
  app/       Point d'entrée : assemble tout, boucle principale. Seul endroit qui connaît tout le monde.
  i18n/      Textes du jeu, un fichier par langue (fr, en).
tests/
  e2e/       Tests Playwright.
tools/
  sim/       Simulateur d'économie en ligne de commande.
  blender/   Scripts Python de génération des modèles 3D.
  assets/    Validation automatique des modèles exportés.
assets/
  models/    Fichiers .glb générés (jamais modifiés à la main).
  audio/     Sons et musiques, avec leur licence dans assets/audio/LICENSES.md.
docs/
  gdd.md, decisions.md, briefs/
```

---

## 4. Règles d'architecture

Ces règles sont vérifiées automatiquement par ESLint. Les contourner (commentaire `eslint-disable`, changement de configuration) est interdit.

### 4.1 Sens des dépendances

```
shared  ←  data  ←  sim  ←  save
                     ↑
        render, audio, ui  (lisent la simulation, ne se connaissent pas entre eux)
                     ↑
                  platform
                     ↑
                    app   (assemble tout)
```

- `sim`, `data`, `save`, `shared` n'importent **jamais** `three`, Preact, Capacitor, ni aucun dossier `render`, `audio`, `ui`, `platform`, `app`.
- `render`, `audio` et `ui` ne s'importent pas entre eux. Ils communiquent par la simulation (commandes et événements) ou par `app`.
- Seul `app` câble les modules ensemble.

### 4.2 La simulation est pure et déterministe

- Pas d'accès au DOM, à `window`, à `localStorage`, au réseau.
- **Pas de `Math.random()`** : tout hasard passe par le générateur à graine stocké dans l'état (`sim/rng`).
- **Pas de `Date.now()` ni de `performance.now()`** : le temps est fourni de l'extérieur à `advance(state, deltaMs)`.
- Même état + mêmes commandes + même durée = **exactement** le même résultat. C'est ce qui rend les tests et la simulation d'économie possibles.
- Pas de stockage de fonctions, de classes ou de références circulaires dans l'état : il doit être sérialisable en JSON tel quel.

### 4.3 Comment le monde change

- Le joueur ne modifie jamais l'état directement. L'interface envoie des **commandes** (`{ type: 'placeEnclosure', ... }`) que la simulation valide puis applique.
- Une commande invalide renvoie une erreur typée (`Result`), jamais une exception silencieuse.
- La simulation émet des **événements** (`{ type: 'arrivalOpened', ... }`) que le rendu, l'audio et l'interface écoutent. Ils ne déduisent rien en fouillant l'état.

### 4.4 Temps et pas fixe

- La simulation avance par pas fixes de 100 ms (10 pas par seconde), avec un accumulateur.
- Le rendu tourne à la fréquence de l'écran et interpole visuellement.
- Le rattrapage hors ligne utilise des pas grossiers (par exemple une minute) pour ne pas simuler des centaines de milliers de pas.

### 4.5 Nombres et argent

- Toutes les monnaies sont des **entiers**. Jamais de nombre à virgule pour de l'argent.
- Les taux et pourcentages sont stockés en points de base entiers (1 % = 100) quand ils servent à des calculs.

### 4.6 Le contenu est des données

- Ajouter une espèce, un objet ou un texte ne demande **aucune** modification du code de jeu : seulement des fichiers dans `src/data` ou `src/i18n`.
- Chaque fichier de données est validé par un schéma zod, et un test charge et valide toutes les données.

---

## 5. Règles de code

- TypeScript : interdit d'utiliser `any`, `as` pour forcer un type (sauf `as const`), `!` pour nier `null`, `@ts-ignore` et `@ts-expect-error`.
- Toute union discriminée est traitée de façon exhaustive (`switch` vérifié par le compilateur).
- Erreurs attendues → type `Result`. Exceptions → uniquement pour les bugs impossibles, jamais avalées par un `catch` vide.
- Identifiants typés (`SpeciesId`, `EnclosureId`…) pour ne jamais confondre deux identifiants.
- Fonctions courtes, noms explicites en anglais, pas de nombres magiques : constantes nommées.
- Code et identifiants en anglais. Commentaires rares, en anglais, qui expliquent le **pourquoi**, jamais le quoi.
- Pas de `console.log` dans le code livré (un logger de développement est fourni dans `shared`).
- Aucun texte visible par le joueur écrit en dur : tout passe par `src/i18n`.

---

## 6. Tests

- Toute modification de `sim`, `save` ou `data` arrive avec ses tests.
- Couverture minimale de `src/sim` et `src/save` : 90 % des lignes. La configuration fait échouer la vérification en dessous.
- Le gacha a un test statistique : un million de tirages à graine fixe, chaque taux vérifié à 0,1 point près, chaque garantie vérifiée sans exception.
- La sauvegarde a des tests d'aller-retour, de migration depuis chaque ancienne version, et de fichier corrompu.
- Un test de bout en bout vérifie que le jeu démarre, affiche le canvas et ne produit aucune erreur dans la console.
- **Il est interdit de supprimer, désactiver, ignorer (`.skip`) ou affaiblir un test pour faire passer la vérification.** Si un test échoue, on corrige le code ; si le test est faux, on l'explique dans le rapport.

---

## 7. Performance

- Cibles : 60 images par seconde sur un téléphone récent, 30 stables sur un Android modeste.
- Pas d'allocation d'objets dans la boucle de rendu (réutiliser vecteurs et matrices).
- Objets répétés en instanciation, modèles simplifiés au loin.
- Une seule texture de palette partagée par les modèles.
- Toute fonctionnalité visuelle coûteuse doit pouvoir se désactiver selon le niveau de qualité.

---

## 8. Méthode de travail des agents (obligatoire)

### Avant de coder

1. Lire ce fichier, le brief de la tâche, et **uniquement** les fichiers concernés. Ne pas parcourir tout le dépôt.
2. Proposer un plan court : fichiers touchés, approche, tests prévus, risques. Attendre la validation si le brief le demande.
3. Si le brief ou le GDD est ambigu ou contradictoire : poser la question, ne pas deviner.

### Pendant

- Petits changements, une seule tâche. Ne pas « en profiter » pour modifier autre chose.
- Ne jamais modifier `tsconfig.json`, la configuration ESLint, Prettier, Vitest ou la CI pour faire passer du code. Ces fichiers ne changent que si le brief le demande explicitement.
- Ne jamais toucher aux fichiers de `assets/models` à la main : ils sont générés.

### Avant de déclarer terminé

1. Lancer `npm run check`. Il doit être entièrement vert.
2. Relire son propre diff comme un relecteur exigeant.
3. Mettre à jour `docs/decisions.md` si une décision a été prise.

### Rapport final (toujours ce format)

```
## Fait
- ...
## Vérifié
- npm run check : vert (nombre de tests)
- ...
## Pas fait / limites
- ...
## Décisions prises
- ...
```

### Définition de « terminé »

- [ ] Le brief est entièrement couvert, rien de plus.
- [ ] `npm run check` est vert.
- [ ] Les nouveaux comportements sont testés.
- [ ] Aucune règle de ce fichier n'est contournée.
- [ ] Le rapport final est rédigé.

---

## 9. Git

- Une tâche = une branche = un agent. Nom : `feat/…`, `fix/…`, `chore/…`, `test/…`.
- Messages de commit au format Conventional Commits, en anglais (`feat(sim): add seeded rng`).
- Jamais de fusion dans `main` si la CI est rouge.
- Deux agents ne travaillent jamais en même temps sur les mêmes fichiers.

---

## 10. Relecture croisée

Le code écrit par un agent est relu par un autre modèle avant fusion. Le relecteur vérifie, dans cet ordre :

1. **Correction :** le code fait-il exactement ce que dit le brief ? Cas limites, valeurs nulles, listes vides, entiers.
2. **Architecture :** sens des dépendances respecté, simulation pure, pas de `Math.random` ni de `Date` dans `sim`.
3. **Tests :** les nouveaux comportements sont-ils testés, y compris les cas d'échec ? Un test a-t-il été affaibli ?
4. **Lisibilité :** noms, taille des fonctions, nombres magiques, commentaires utiles.
5. **Performance :** allocations dans les boucles, travail inutile à chaque image.
6. **Textes :** rien d'écrit en dur hors de `i18n`.

Le relecteur répond par une liste : **bloquant**, **à corriger**, **suggestion**. Il ne réécrit pas le code lui-même.

---

## 11. En cas de doute

S'arrêter et demander. Une question coûte une minute ; une mauvaise supposition coûte une journée.
