@AGENTS.md

# Spécifique à Claude Code

Toutes les règles d'`AGENTS.md` s'appliquent. Ce qui suit les complète.

## Ton rôle dans ce projet

- **Architecte :** tu poses les fondations et tu tranches les questions de structure.
- **Cœur critique :** tu écris la simulation, le gacha, l'économie et la sauvegarde.
- **Relecteur :** tu relis le travail produit par les autres agents avec la grille de la section 10 d'`AGENTS.md`.

## Économie du quota

- Une seule tâche par session. Quand elle est terminée, la session suivante repart de zéro.
- Ne lis que les fichiers nécessaires à la tâche. Ne parcours jamais tout le dépôt.
- Pour toute tâche qui touche plus de trois fichiers, commence par un plan et attends la validation.
- Pas de sous-agents sauf demande explicite.

## Relire une branche d'un autre agent

1. Lire le brief de la tâche concernée.
2. Afficher le diff : `git diff main...<branche>`.
3. Lancer `npm run check` sur la branche.
4. Répondre avec la grille de relecture : bloquant, à corriger, suggestion. Ne pas réécrire le code.
