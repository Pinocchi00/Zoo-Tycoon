# Zoo Refuge

Tycoon de zoo mobile, calme et chaleureux (nom provisoire). Règles du dépôt : [AGENTS.md](AGENTS.md). Conception : [docs/gdd.md](docs/gdd.md).

## Installer

Prérequis : [Node.js](https://nodejs.org/) 24 (voir `.nvmrc`) et Git.

```bash
npm ci
```

## Lancer

```bash
npm run dev
```

Puis ouvrir l'adresse affichée (par défaut http://localhost:5173).

## Vérifier

```bash
npm run check
```

Enchaîne la vérification des types, le linter, le formatage, les tests avec couverture et la construction. Tout doit être vert avant de fusionner.

| Script                  | Rôle                                             |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Serveur de développement                         |
| `npm run build`         | Construction de production dans `dist/`          |
| `npm run preview`       | Sert la construction de production               |
| `npm run typecheck`     | Vérification des types TypeScript                |
| `npm run lint`          | ESLint, dont les frontières d'architecture       |
| `npm run format`        | Met le code en forme avec Prettier               |
| `npm run format:check`  | Vérifie la mise en forme sans rien modifier      |
| `npm run test`          | Tests unitaires (Vitest)                         |
| `npm run test:coverage` | Tests avec couverture (90 % sur `sim` et `save`) |
| `npm run check`         | Tout ce qui précède, dans l'ordre                |
| `npm run e2e`           | Construit le jeu puis lance les tests Playwright |

## Tests de bout en bout

La première fois, installer le navigateur de test :

```bash
npx playwright install chromium
```

Puis :

```bash
npm run e2e
```

Le test de démarrage vérifie que le jeu se charge sans aucune erreur ni aucun avertissement dans la console.

## Intégration continue

À chaque push et à chaque pull request, GitHub Actions lance `npm ci`, `npm run check` puis les tests Playwright (`.github/workflows/ci.yml`). Le résultat est visible dans l'onglet **Actions** du dépôt.

### Protéger la branche `main`

À faire une seule fois, après que la CI a tourné au moins une fois (sinon le contrôle `check` n'apparaît pas dans la liste) :

1. Sur la page du dépôt GitHub, cliquer sur l'onglet **Settings** (en haut à droite).
2. Dans le menu de gauche, section **Code and automation**, cliquer sur **Branches**.
3. Cliquer sur **Add classic branch protection rule**.
4. Dans **Branch name pattern**, écrire `main`.
5. Cocher **Require a pull request before merging**, puis décocher la case **Require approvals** qui apparaît en dessous (seul sur le projet, on ne peut pas approuver sa propre pull request).
6. Cocher **Require status checks to pass before merging**, puis :
   - cocher **Require branches to be up to date before merging** ;
   - dans le champ de recherche **Search for status checks…**, taper `check` et cliquer sur le résultat **check** (GitHub Actions).
7. Cocher **Do not allow bypassing the above settings** (sinon l'administrateur, c'est-à-dire toi, peut passer outre).
8. Laisser **Allow force pushes** et **Allow deletions** décochés.
9. Cliquer sur **Create** en bas de la page, puis confirmer avec ton mot de passe si GitHub le demande.

Pour vérifier : ouvrir une pull request dont la CI est rouge. Le bouton **Merge pull request** doit être grisé.
