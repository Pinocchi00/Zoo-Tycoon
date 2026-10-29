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
