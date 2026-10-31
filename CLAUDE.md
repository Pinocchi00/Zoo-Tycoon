@AGENTS.md

# Spécifique à Claude Code

Toutes les règles d'`AGENTS.md` s'appliquent. Ce qui suit les complète.

## Ton rôle dans ce projet

- **Chef d'orchestre :** tu lis le brief, tu proposes le plan, tu attends l'OK, puis tu délègues (voir « Délégation aux sous-agents »).
- **Architecte :** tu poses les fondations et tu tranches les questions de structure.
- **Cœur critique :** tu écris toi-même la simulation, le gacha, l'économie, la sauvegarde et les schémas de données.
- **Garant de la qualité :** tu fais vérifier et relire le travail par les sous-agents avant d'écrire le rapport final. Tu ne relis jamais toi-même le code que tu as écrit : c'est le rôle du sous-agent `relecteur`.

## Économie du quota

- Une seule tâche par session. Quand elle est terminée, la session suivante repart de zéro.
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

## Délégation aux sous-agents

Un sous-agent ne voit pas ta conversation. Il reçoit seulement ton message de délégation et ne te renvoie qu'un résumé. Écris donc des messages qui se suffisent à eux-mêmes.

- **Tâches critiques** (simulation, gacha, économie, sauvegarde, schémas de données) : tu écris le code toi-même. Tu délègues seulement la vérification (`verificateur`) et la relecture (`relecteur`).
- **Autres tâches** (outillage, rendu, interface, audio technique, Android, pipeline Blender) : tu planifies, puis tu délègues l'écriture à `executant`. Son message contient la section du brief, la liste exacte des fichiers à toucher et les critères d'acceptation.
- **Contenu répétitif** (données d'espèces, textes, descriptions d'espèces pour Blender) : tu le délègues à `contenu`, avec le fichier gabarit à copier.
- **Recherche dans le dépôt** : tu la délègues à `Explore`.
- **Journaux longs** : tu ne les lis pas. Tu fais lancer `npm run check` (et `npm run e2e`) par `verificateur`, qui te renvoie un résumé.
- **Fin de chaque tâche :** `relecteur` relit la branche une seule fois. Tu fais corriger les points Bloquant et À corriger par un nouvel `executant` (ou tu les corriges toi-même pour une tâche critique), tu refais vérifier par `verificateur`, puis tu écris le rapport final au format d'`AGENTS.md`. Les Suggestions ne déclenchent pas de nouveau cycle : note-les dans le rapport.
- **Jamais de cascade :** un sous-agent ne lance jamais d'autres sous-agents. Seul le chef délègue.

## Relire une branche

Le sous-agent `relecteur` suit cette méthode. Elle sert aussi à une relecture manuelle dans une nouvelle session.

1. Lire le brief de la tâche concernée.
2. Afficher le diff : `git diff main...<branche>`.
3. Lancer `npm run check` sur la branche.
4. Répondre avec la grille de relecture : bloquant, à corriger, suggestion. Ne pas réécrire le code.
