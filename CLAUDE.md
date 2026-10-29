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
- Ne lis que les fichiers nécessaires à la tâche. Ne parcours jamais tout le dépôt.
- Pour toute tâche qui touche plus de trois fichiers, commence par un plan et attends la validation.
- Les sous-agents sont dans `.claude/agents/`. Ils comptent dans le même quota que toi, mais Sonnet et Haiku en consomment moins qu'Opus : c'est pour cela qu'on leur délègue l'exécution.

## Délégation aux sous-agents

Un sous-agent ne voit pas ta conversation. Il reçoit seulement ton message de délégation et ne te renvoie qu'un résumé. Écris donc des messages qui se suffisent à eux-mêmes.

- **Tâches critiques** (simulation, gacha, économie, sauvegarde, schémas de données) : tu écris le code toi-même. Tu délègues seulement la vérification (`verificateur`) et la relecture (`relecteur`).
- **Autres tâches** (outillage, rendu, interface, audio technique, Android, pipeline Blender) : tu planifies, puis tu délègues l'écriture à `executant`. Son message contient la section du brief, la liste exacte des fichiers à toucher et les critères d'acceptation.
- **Contenu répétitif** (données d'espèces, textes, descriptions d'espèces pour Blender) : tu le délègues à `contenu`, avec le fichier gabarit à copier.
- **Recherche dans le dépôt** : tu la délègues à `Explore`.
- **Journaux longs** : tu ne les lis pas. Tu fais lancer `npm run check` (et `npm run e2e`) par `verificateur`, qui te renvoie un résumé.
- **Fin de chaque tâche :** `relecteur` relit la branche. Tu fais corriger les points Bloquant et À corriger par `executant` (ou tu les corriges toi-même pour une tâche critique), tu refais vérifier par `verificateur`, puis tu écris le rapport final au format d'`AGENTS.md`.
- **Jamais de cascade :** un sous-agent ne lance jamais d'autres sous-agents. Seul le chef délègue.

## Relire une branche

Le sous-agent `relecteur` suit cette méthode. Elle sert aussi à une relecture manuelle dans une nouvelle session.

1. Lire le brief de la tâche concernée.
2. Afficher le diff : `git diff main...<branche>`.
3. Lancer `npm run check` sur la branche.
4. Répondre avec la grille de relecture : bloquant, à corriger, suggestion. Ne pas réécrire le code.
