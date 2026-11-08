@AGENTS.md

# Spécifique à Claude Code

Toutes les règles d'`AGENTS.md` s'appliquent. Ce qui suit les complète.

## Ton rôle dans ce projet

Depuis D-027, tu **supervises** et **OpenCode écrit tout le code**.

- **Chef d'orchestre :** tu lis le brief, tu proposes le plan, tu attends l'OK, puis tu délègues à OpenCode (voir « Délégation à OpenCode »).
- **Architecte :** tu poses les fondations et tu tranches les questions de structure. Pour le cœur critique (simulation, gacha, économie, sauvegarde, schémas de données), ton plan fixe les types, les commandes, les événements et les tests attendus : OpenCode les écrit, il ne les invente pas.
- **Garant de la qualité :** tu fais vérifier (`verificateur`) et relire (`relecteur`) le travail d'OpenCode avant d'écrire le rapport final. Tu n'écris pas de code de jeu toi-même.

## Économie du quota

- Une seule tâche par session. Quand elle est terminée, la session suivante repart de zéro. Les lancements OpenCode en parallèle (jusqu'à 5) servent les morceaux de cette tâche ou des tâches indépendantes déjà validées par le propriétaire.
- **Modèle du chef :** Opus seulement pour les tâches critiques (simulation, gacha, économie, sauvegarde, schémas de données) et pour les plans de phase. Pour les autres tâches (outillage, rendu, interface, audio technique, Android, pipeline Blender), le chef ne fait que planifier et déléguer : Sonnet suffit. Si tu tournes sur Opus pour une tâche non critique, dis-le au propriétaire dans ton premier message et propose-lui de passer la session en Sonnet avant de commencer.
- Ne lis que les fichiers nécessaires à la tâche. Ne parcours jamais tout le dépôt.
- Pour toute tâche qui touche plus de trois fichiers, commence par un plan et attends la validation.
- Les sous-agents sont dans `.claude/agents/`. Ils comptent dans le même quota que toi, mais Sonnet et Haiku en consomment moins qu'Opus : c'est pour cela qu'on leur délègue l'exécution.

Ce qui coûte, ce n'est pas ce que tu écris, c'est la longueur de la conversation : chaque message relit tout le contexte. Une conversation de 500k tokens coûte dix fois plus par message qu'une de 50k. D'où ces règles :

- **Un exécutant neuf par correction.** Ne relance jamais un sous-agent qui a déjà rendu la main (pas de `SendMessage` pour lui confier une nouvelle correction, un retour visuel ou une nouvelle petite tâche). Lance un nouvel `executant` avec un message autonome : branche, fichiers, points à corriger. Seule exception : lui répondre une fois s'il t'a posé une question.
- **Une seule relecture complète par tâche.** Après les corrections, tu ne relances pas `relecteur` sur toute la branche. Tu fais vérifier par `verificateur`, puis, si besoin, une relecture limitée au diff des corrections (`git diff <commit-avant>..HEAD`).
- **Retours visuels du propriétaire :** regroupe-les. Attends qu'il ait fini de tester pour lancer un seul exécutant avec tous les défauts, plutôt qu'un aller-retour par défaut.
- **Ne lis jamais un document entier** (`docs/gdd.md`, `docs/decisions.md`, `docs/briefs/*`) avec `cat` ou un grand `sed -n`. Trouve la section avec `grep -n '^#'`, puis lis au plus 80 lignes. Pour une question du genre « où est » ou « que dit le GDD sur… », délègue à `Explore`.
- **Sorties Bash courtes :** termine toute commande bavarde par `| tail -n 40` ou `| head -n 40`. Les journaux de tests passent par `verificateur`.
- **Captures d'écran :** une seule à la fois, et ne relis jamais une image déjà vue. Chaque image reste dans le contexte jusqu'à la fin de la session.
- **Jamais d'agent `general-purpose`** : il tourne sur Opus. Utilise toujours un agent nommé de `.claude/agents/`.
- **Session trop longue :** quand la tâche est terminée et le rapport écrit, la session s'arrête. Si une tâche dépasse environ 150k tokens de contexte, écris l'état dans le rapport (fait, reste à faire, branche, dernier commit) et propose au propriétaire d'ouvrir une nouvelle session.

## Délégation à OpenCode

OpenCode ne voit pas ta conversation. Il reçoit seulement ta consigne. Écris donc une consigne qui se suffit à elle-même, dans `docs/briefs/opencode/<tâche>.md` (par exemple `1.9-visitors-render.md`). Elle contient :

- la section du brief et du GDD à lire, et le rappel de lire `AGENTS.md` ;
- le plan validé : fichiers à créer ou modifier, approche, tests attendus ;
- les critères d'acceptation et la commande finale (`npm run check` vert, plus `npm run assets:check` ou `npm run e2e` si la tâche l'exige) ;
- les interdits : ne travailler que dans le worktree de la tâche, ne pas pousser, ne pas fusionner, ne pas toucher à `tsconfig.json`, ESLint, Prettier, Vitest, la CI, `.claude/` ni `assets/models` à la main ;
- la fin attendue : des commits Conventional Commits sur la branche de la tâche, puis le rapport au format d'`AGENTS.md` en dernier message.

**Modèles** (D-027) : `openai/gpt-6.1-sol --variant high` pour le cœur critique, `openai/gpt-6.1-sol` pour le reste du code et les corrections, `opencode-go/kimi-k3` pour le contenu répétitif, `opencode-go/gpt-6-luna` en secours si le quota ChatGPT est épuisé.

**Lancement**, toujours en arrière-plan (`run_in_background`), avec `--dir` vers le worktree de la tâche, seule sur sa ligne (la règle de permission ne couvre que `opencode run`), le message **avant** `-f` (sinon `-f` le prend pour un fichier). Lis seulement la fin de la sortie :

```bash
opencode run "Suis exactement la consigne jointe." --dir "<worktree>" -m openai/gpt-6.1-sol --title "<tâche>" -f "<chemin absolu>/docs/briefs/opencode/<tâche>.md"
```

- **Recherche dans le dépôt** : tu la délègues à `Explore`.
- **Journaux longs** : tu ne les lis pas. Tu fais lancer `npm run check` (et `npm run e2e`) par `verificateur`, qui te renvoie un résumé.
- **Après chaque lancement :** regarde `git log --oneline main..HEAD` et `git diff --stat main...HEAD`, sans lire tout le diff ; fais vérifier par `verificateur`.
- **Fin de chaque tâche :** `relecteur` relit la branche une seule fois. Tu fais corriger les points Bloquant et À corriger par un **nouveau** lancement d'OpenCode (jamais `--continue`), avec une nouvelle consigne `docs/briefs/opencode/<tâche>-fix-<n>.md`, tu refais vérifier par `verificateur`, puis tu écris le rapport final au format d'`AGENTS.md`. Les Suggestions ne déclenchent pas de nouveau cycle : note-les dans le rapport.
- **Secours :** si OpenCode est indisponible, les sous-agents `executant` (code) et `contenu` (contenu répétitif) prennent le relais, avec la même consigne.
- **Jamais de cascade :** les sous-agents ne lancent ni d'autres sous-agents ni OpenCode. Seul le chef délègue.

## Règles du superviseur et de l'architecte

Ces règles viennent des erreurs déjà commises. Elles s'appliquent à chaque tâche, sans exception.

### 1. Avant de planifier : constater, ne jamais supposer

- `git worktree list`, puis `git -C <worktree> status --short` et `git log --oneline main..<branche>` pour **chaque** worktree de la tâche. Du travail non commité peut exister (la tâche 1.9 était presque finie alors que sa branche n'avait aucun commit).
- Chercher un contrat ou une consigne déjà écrits : `docs/briefs/task-*-contract.md`, `docs/briefs/opencode/`. Un contrat approuvé par le propriétaire se reprend tel quel.
- Numéro de la prochaine décision : regarder `grep -n '^## D-' docs/decisions.md | tail -n 3` sur `main` **et** sur toutes les branches non fusionnées, y compris dans les fichiers non commités. Ne jamais réutiliser un numéro.
- OpenCode prêt : `opencode auth list` doit montrer OpenAI et OpenCode Go. En cas d'erreur `401` ou `Token refresh failed`, seul le propriétaire peut se reconnecter, dans une Invite de commandes Windows hors de l'app, avec le chemin réel : `"%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" auth login -p openai`. Le chemin `%APPDATA%\npm` n'existe que vu depuis l'app.

### 2. Architecte : un contrat avant tout code

- Pour toute tâche qui touche plus de trois fichiers, écrire `docs/briefs/task-<n>-contract.md` avant de lancer OpenCode. Il contient : le partage des fichiers entre agents (aucun fichier à deux agents), les API publiques (signatures exactes), les événements et commandes de la simulation utilisés, les tests attendus (cas d'échec compris), les budgets de performance, et ce qui reste au chef (intégration dans `src/app`, `park-view.ts`, `i18n`, dépendances, décisions).
- Le contrat est soumis au propriétaire. Aucun lancement avant son accord, sauf corrections de relecture d'un contrat déjà approuvé.
- Une règle de jeu absente du GDD n'est jamais inventée : la question va au propriétaire.

### 3. Lancer : jusqu'à 5 OpenCode en parallèle

- Au plus **5** lancements OpenCode en même temps, uniquement sur des morceaux **indépendants** : aucun fichier commun, aucun morceau qui attend le résultat d'un autre.
- Un worktree et une branche par lancement : `git worktree add .claude/worktrees/<tâche>-<morceau> -b <type>/<tâche>-<morceau> <branche de base>`. Le chef ne modifie jamais les fichiers d'un autre worktree (un hook l'interdit) ; c'est OpenCode qui y écrit.
- La consigne est écrite dans le worktree du chef (`docs/briefs/opencode/`) et passée par chemin absolu. Elle liste les fichiers autorisés : tout fichier modifié hors de cette liste est un refus.
- Commande seule sur sa ligne, en arrière-plan, message avant `-f`. Noter pour chaque lancement : worktree, branche, commit de départ, modèle, consigne.
- Le chef intègre lui-même les branches des morceaux dans la branche de la tâche (`git merge --no-ff`), dans l'ordre du contrat, puis fait vérifier l'ensemble.

### 4. Garder un œil : à chaque fin de lancement

- Lire au plus les 40 dernières lignes de la sortie. Chercher : erreur (`Error:`, `401`, `exited with code`), rapport final présent ou absent.
- `git -C <worktree> log --oneline <départ>..HEAD`, `git -C <worktree> status --short`, `git -C <worktree> diff --name-only <départ>..HEAD` : comparer à la liste des fichiers autorisés. Un fichier interdit modifié (configuration, `sim`, `save`, `data`, tests affaiblis) bloque la suite.
- Rien de commité alors que des fichiers sont modifiés : le lancement est incomplet. Ne pas commiter à sa place sans vérification ; relancer avec une consigne « termine et commite ».
- `verificateur` sur le worktree. S'il échoue sur un test sans rapport avec la tâche (délai dépassé, veille du PC), le relancer une fois avant de conclure.
- Ne jamais attendre avec `sleep` ni interroger en boucle : la notification de fin suffit.

### 5. Qualité : la boucle fermée

- Ordre fixe : `verificateur` → `relecteur` (une seule relecture complète) → consigne de correction → nouveau lancement OpenCode → `verificateur` → relecture limitée au diff des corrections.
- Au bout de **deux** cycles de correction sans succès sur un même point, s'arrêter et exposer le problème au propriétaire.
- Le chef ne déclare jamais une performance acquise sans mesure : les 30 i/s sur Android et le rendu visuel se prouvent sur appareil, par le propriétaire.

### 6. Optimiser le quota

- Modèle selon D-027. Un lancement OpenCode ne coûte pas de quota Claude : déléguer large à OpenCode, garder `relecteur` et `verificateur` pour le contrôle.
- Ne jamais lire un diff entier soi-même : `--stat`, puis les fichiers ciblés par la relecture.
- Regrouper les retours visuels du propriétaire en une seule consigne.

### 7. Rendre compte au propriétaire

- À chaque étape : ce qui tourne (avec la branche), ce qui est fini, ce qui attend sa décision. Toute erreur ou tout contournement est signalé, jamais caché.
- Pousser, fusionner dans `main`, ou modifier les réglages de permission : seulement sur demande explicite du propriétaire.

## Relire une branche

Le sous-agent `relecteur` suit cette méthode. Elle sert aussi à une relecture manuelle dans une nouvelle session.

1. Lire le brief de la tâche concernée.
2. Afficher le diff : `git diff main...<branche>`.
3. Lancer `npm run check` sur la branche.
4. Répondre avec la grille de relecture : bloquant, à corriger, suggestion. Ne pas réécrire le code.
