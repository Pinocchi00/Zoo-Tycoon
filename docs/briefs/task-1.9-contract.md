# Tâche 1.9 — Contrat d'implémentation approuvé

Le 4 novembre 2026, le propriétaire accepte les pièces articulées instanciées et la petite bulle Preact dès 1.9. Les autres écrans restent en 1.11. OpenCode Go est autorisé comme outil de délégation, sous supervision et relecture indépendante. Ce contrat complète le brief 1.9, sans nouvelle règle de simulation.

## Responsabilités sans chevauchement

- Agent pipeline : `tools/blender/visitors/**`, `tools/blender/run.ts`, GLB générés `assets/models/visitors/**`. Aucun changement aux scripts/pièces/palette des animaux.
- Agent rendu : `src/render/visitors/**` et tests dans ce seul dossier.
- Agent interaction : `src/render/camera/controls.ts`, son test, un tracker de tap et tests dans ce dossier ; `src/ui/**` et sa CSS.
- Agent validation : `tools/assets/**` et ses tests. Aucun changement aux règles effectives des animaux.
- Chef : `src/app/**`, `src/render/park-view.ts`, `src/render/index.ts`, textes `src/i18n/**`, dépendances, décisions, e2e et intégration. Aucun agent ne modifie ces fichiers.
- Aucun changement sim/save/data, configurations TypeScript/lint/tests/CI. Aucune fusion ni commit par les délégués.

## Fichiers visiteurs et modèle articulé

Un GLB par archétype, nommé selon son identifiant existant : `stroller-family`, `shoulder-ride`, `couple`, `teen-photographer`, `retirees`. La description JSON porte le même identifiant. Pour représenter fidèlement les groupes existants, le modèle contient le nombre maximal de personnes de l'archétype (respectivement 4, 2, 2, 1, 2) ; le rendu cache les membres d'index supérieur ou égal au `groupSize` actuel. Les membres sont ordonnés : famille = parents 0/1, bébé 2, enfant 3 ; épaules = parent 0, enfant 1. Les accessoires font partie de leur propriétaire et ne comptent pas comme personne supplémentaire.

Les 800–1 500 triangles sont vérifiés **par personne représentée**, accessoires inclus pour leur propriétaire ; le budget total du fichier est donc ce budget multiplié par le nombre de personnes. Chaque pièce géométrique porte les propriétés personnalisées exportées en glTF extras : `zooPerson` (index entier), `zooTint` (`skin`, `hair`, `shirt`, `pants` ou `none`). Les noms de pièces sont uniques et commencent par `p<index>_`. Racine par personne `p<index>_root` ; plusieurs articulations distinctes pour membres et tête.

Le modèle est une hiérarchie de pièces rigides **non skinnées**, parentées à des articulations animées (des objets pivots suffisent). Pas de fusion des pièces animées et pas d'unique matrice de corps pour simuler les bras/jambes. Réutiliser `build_part` et la palette existante sans modifier ces bibliothèques ; chaque pièce reste un Mesh normal dont la matrice mondiale est animée par les clips. Racine de groupe nommée selon l'archétype, extras `zooVisitor` = `{ version:1, archetypeId:string, memberCount:number }`.

Six animations non vides : `walk`, `stop`, `look`, `point`, `photo`, `sit`. L'arrêt doit être une pose stable avec une respiration discrète. Pas d'animation météo nouvelle. La poussette suit la marche des parents, le bébé est dans la poussette, l'enfant est sur les épaules pour son archétype ; chapeau/lunettes et appareil photo sont reconnaissables.

Un seul matériau `palette`, une seule texture de palette par fichier. Le runtime partage un même matériau/texture entre modèles. Les teintes personnalisables utilisent une case claire existante de la palette et une couleur par instance ; aucun ajout de texture. Des proportions et coiffures variées doivent être présentes, avec suffisamment de combinaisons d'apparence déterministes pour éviter la répétition visuelle récente. Le rendu utilise son propre hasard visuel et ne modifie pas celui de la simulation.

## API de rendu à fournir

`src/render/visitors/index.ts` exporte `createVisitorCrowd` et ses types, sans import UI/audio/app.

Options minimales : `{ parent: Object3D, grid: GridSize }`. Le module gère son chargement des GLB par `import.meta.glob` sur `assets/models/visitors/*.glb` et ne casse pas le démarrage si un fichier manque ou est invalide (erreur logger typée/lisible, groupe non affiché).

Contrat public :

- `syncAll(world: VisitorWorld): void` ; `VisitorWorld` contient `visitors: { list: readonly VisitorState[] }`.
- `handleEvents(events: readonly GameEvent[], world: VisitorWorld): void` ; peut mémoriser le monde courant pour les images suivantes.
- `update(elapsedMs: number): void` ; réutilise pools, vecteurs, matrices et slots ; aucune allocation d'objet dans sa boucle par image.
- `pick(camera: Camera, x: number, y: number, width: number, height: number): VisitorId | null` ; coordonnées CSS du canvas, sélection du groupe associé à la personne touchée.
- `project(id: VisitorId, camera: Camera, width: number, height: number, out: {x:number;y:number}): boolean` ; false si absent/hors écran.
- `dispose(): void` ; libère et protège les chargements asynchrones tardifs.
- `stats(): {people:number;groups:number;drawCalls:number}` ; appel d'inspection hors boucle, chiffres de rendu et non garanties FPS.

Au chargement, échantillonner une fois les poses des clips via AnimationMixer sur le modèle source. En jeu, appliquer aux Mesh instanciés les poses prééchantillonnées par pièce et les transformations de groupe. Aucun clone de squelette/mixeur par personne. Interpoler les poses et transitions sans créer d'objet par image. Garder les personnes et phases stables par identifiant de groupe. Les trois activités existantes restent les seules décisions de jeu ; point/photo/regard sont des variantes purement visuelles.

## Tap et bulle

`attachCameraControls` reçoit un quatrième argument optionnel `onTap: (x:number,y:number)=>void`, en coordonnées CSS du canvas. Annuler le candidat après dépassement d'un seuil de déplacement (même s'il revient ensuite au départ), deuxième pointeur, annulation ou perte de capture. Seul un relâchement du pointeur principal d'un geste propre déclenche un tap. Ne pas casser pan/pinch/rotation.

`src/ui/index.ts` exporte `createVisitorThoughtBubble(parent:HTMLElement,onClose:()=>void)`, renvoyant `{show(text:string,x:number,y:number,closeLabel:string):void;hide():void;dispose():void}`. Preact 11.1.1 est ajouté par le chef. Utiliser `h`/`render` dans des fichiers `.ts` : aucune modification de tsconfig ni JSX nécessaire. ClasseCSS propre, taille lisible, bouton de fermeture accessible dont le texte est fourni par `app`, repositionnement sans déborder le viewport. Le composant ne connaît ni simulation ni rendu et ne produit pas de texte joueur en dur.

Seul `app` relie tap, picking, `visitorThoughtKey`, traduction et affichage. Le groupe qui quitte le parc ferme sa bulle. Le chef adapte ParkView et les tests d'intégration après livraison des modules.

## Validation

Chaque délégué ajoute les tests utiles de son périmètre et peut lancer uniquement ces tests/formatage sur ses fichiers. Pas de check complet pendant les écritures concurrentes. Le chef réalise ensuite les contrôles complets et une relecture indépendante. Aucun test existant n'est affaibli. La preuve de 30 images/s sur Android et la validation visuelle restent à mesurer réellement, sans être déclarées acquises par les tests PC.
