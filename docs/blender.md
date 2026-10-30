# Générer les modèles 3D avec Blender

Les animaux du jeu ne sont pas dessinés à la main : des scripts Python les construisent dans Blender à partir d'une description, puis les exportent en `.glb`. Ce guide explique comment relancer cette génération sur ton PC.

Tu n'en as besoin que si tu modifies une description d'espèce ou la palette. Les fichiers `.glb` déjà générés sont dans le dépôt, et la vérification (`npm run check`) fonctionne sans Blender.

## 1. Installer Blender

1. Va sur <https://www.blender.org/download/> et télécharge la version pour Windows (4.3 ou plus récente). La version Steam convient aussi.
2. Installe-la normalement.
3. Repère le chemin de `blender.exe`. Par exemple :
   - installation classique : `C:\Program Files\Blender Foundation\Blender 4.3\blender.exe` ;
   - version Steam : `D:\Steam\steamapps\common\Blender\blender.exe`.

## 2. Dire au projet où est Blender

Dans le terminal de VS Code (PowerShell), à chaque nouvelle session :

```powershell
$env:BLENDER_PATH = "D:\Steam\steamapps\common\Blender\blender.exe"
```

Remplace le chemin par le tien. Si `blender` est déjà dans ton PATH, cette étape est inutile.

## 3. Lancer la génération

```powershell
npm run models
```

Blender s'ouvre sans fenêtre, construit chaque espèce de `tools/blender/species/` et écrit `assets/models/<espèce>.glb`. Pour chaque animal, une ligne indique le nombre de triangles :

```
[zoo-refuge] capybara: 2308 triangles -> ...\assets\models\capybara.glb
```

Puis vérifie que les modèles respectent les règles :

```powershell
npm run assets:check
```

`ok capybara` : le modèle est accepté. `REFUSED` : la raison est écrite juste en dessous (trop de triangles, animation (`idle`, `walk`, `sleep`, `eat` ou la signature) manquante, mauvaise taille…).

Pour contrôler à l'œil que chaque espèce se reconnaît en ombre noire, génère la planche de silhouettes (les modèles de `assets/models/` vus de profil, 48 pixels chacun, côte à côte) dans `docs/silhouettes.png` :

```powershell
npm run models:silhouettes
```

## 4. Où sont les choses

| Fichier | Rôle |
| --- | --- |
| `tools/blender/species/<espèce>.json` | La description d'un animal : taille réelle, animation signature, os, pièces (position, taille, couleur), réglages des animations. C'est ici qu'on ajuste un animal. |
| `tools/blender/palette.json` | Les couleurs partagées par tous les animaux (une seule petite texture). |
| `tools/blender/parts.py` | La bibliothèque de pièces : corps, tête, museau, oreilles, yeux, pattes, pieds, queue, taches. |
| `tools/blender/rig.py` | Le squelette : chaque pièce suit un seul os. |
| `tools/blender/animations.py` | Les animations : `idle`, `walk`, `sleep` et `eat` pour tous, plus la signature de l'espèce (`swim`, `stretch`, `trunk` ou `root`). |
| `tools/blender/silhouettes.py` | La planche de silhouettes (`npm run models:silhouettes`). |
| `tools/blender/build.py` | Assemble le tout et exporte le `.glb`. |
| `tools/assets/` | La vérification automatique des modèles. |

Les coordonnées des descriptions sont en mètres : `x` vers la gauche de l'animal, `y` vers le haut, `z` vers l'avant (le museau). Une pièce `"mirror": true` est copiée de l'autre côté. `mirrorOffset` décale un peu la copie, pour l'asymétrie voulue par le GDD (une oreille plus basse).

## 5. Règles

- Ne jamais modifier un `.glb` à la main : on change la description, puis on relance `npm run models`.
- La génération est reproductible : deux lancements donnent exactement le même fichier. Après `npm run models`, si `git status` montre un `.glb` modifié, c'est que la description, la palette ou les scripts ont changé.
- Après chaque modification, regarde le résultat dans le jeu (`npm run dev`) : le modèle doit rester reconnaissable au premier coup d'œil.
