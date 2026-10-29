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
