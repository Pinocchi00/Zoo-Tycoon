# Installer Zoo Refuge sur ton téléphone Android

Ce guide part de zéro. Suis les étapes dans l'ordre. Compte environ une heure la première fois, surtout à cause des téléchargements ; les fois suivantes, deux minutes suffisent.

Tu auras besoin :

- de ton PC Windows, avec le dépôt `zoo-refuge` déjà installé (Git et Node.js marchent) ;
- de ton téléphone Android ;
- d'un **câble USB qui transfère des données**. Certains câbles ne font que charger : si le téléphone n'est jamais détecté, essaie un autre câble.

---

## Étape 1 — Installer Android Studio (une seule fois)

Android Studio est le logiciel de Google qui transforme le jeu en application Android et l'envoie sur le téléphone.

1. Va sur <https://developer.android.com/studio> et clique sur **Download Android Studio**.
2. Accepte les conditions, télécharge, puis lance le fichier `.exe`.
3. Clique sur **Next** à chaque écran en gardant les choix proposés, puis sur **Install**, puis sur **Finish**.
4. Au premier lancement, Android Studio ouvre un assistant :
   - s'il demande d'importer des réglages, choisis **Do not import settings** ;
   - choisis l'installation **Standard** ;
   - accepte chaque licence (clique sur chaque ligne à gauche, puis sur **Accept**) ;
   - clique sur **Finish** et attends la fin des téléchargements. Ça peut prendre 10 à 20 minutes.
5. Quand l'écran **Welcome to Android Studio** apparaît, c'est terminé. Tu peux fermer Android Studio.

---

## Étape 2 — Préparer ton téléphone (une seule fois)

Il faut autoriser le téléphone à recevoir des applications depuis ton PC. Les noms exacts des menus changent un peu selon la marque ; les variantes Samsung sont indiquées entre parenthèses.

### 2.1 Activer le mode développeur

1. Ouvre **Paramètres**.
2. Va dans **À propos du téléphone**. (Samsung : **À propos du téléphone** → **Informations sur le logiciel**.)
3. Trouve la ligne **Numéro de build** (ou **Numéro de version**).
4. **Touche-la 7 fois de suite.** Le téléphone peut demander ton code de déverrouillage.
5. Le message « Vous êtes maintenant développeur » apparaît.

### 2.2 Activer le débogage USB

1. Reviens dans **Paramètres**.
2. Ouvre **Options pour les développeurs**. Il est souvent dans **Système**, ou tout en bas des paramètres sur Samsung.
3. Active **Débogage USB** et confirme avec **OK**.

### 2.3 Brancher le téléphone

1. Branche le téléphone au PC avec le câble USB.
2. Déverrouille le téléphone. Une fenêtre **« Autoriser le débogage USB ? »** apparaît.
3. Coche **Toujours autoriser sur cet ordinateur**, puis touche **Autoriser**.

Si la fenêtre n'apparaît pas, débranche puis rebranche le câble, téléphone déverrouillé.

---

## Étape 3 — Construire le jeu pour Android

À refaire **chaque fois que le code du jeu change**.

1. Ouvre un terminal dans le dossier `zoo-refuge`. Dans VS Code : menu **Terminal** → **Nouveau terminal**.
2. Récupère la dernière version et ses dépendances :

   ```bash
   git pull
   ```

   ```bash
   npm install
   ```

3. Construis le jeu et copie-le dans le projet Android :

   ```bash
   npm run android
   ```

   Tout doit se terminer sans ligne rouge `error`. La dernière ligne ressemble à `√ update android`.

4. Ouvre le projet dans Android Studio :

   ```bash
   npm run android:open
   ```

   Si un message dit qu'Android Studio est introuvable, ouvre Android Studio toi-même, clique sur **Open**, choisis le dossier `zoo-refuge\android` puis **OK**.

5. **La première fois seulement**, Android Studio prépare le projet (« Gradle sync ») : une barre de progression tourne en bas à droite pendant plusieurs minutes. Attends qu'elle disparaisse. S'il demande « Trust project? », clique sur **Trust Project**.

---

## Étape 4 — Lancer l'app sur le téléphone

1. En haut d'Android Studio, une liste déroulante affiche les appareils. Choisis ton téléphone (son nom de modèle). S'il n'y est pas, va voir « En cas de problème » plus bas.
2. Clique sur le **triangle vert ▶ (Run 'app')** juste à côté.
3. Attends : la première fois, la construction prend quelques minutes. L'app **Zoo Refuge** s'ouvre ensuite toute seule sur le téléphone.

L'app reste installée : tu peux maintenant la débrancher et la lancer depuis l'écran d'accueil, comme n'importe quelle application.

---

## Étape 5 — Vérifier que tout marche

### Ce que tu dois voir

- [ ] Le parc vide en 3D s'affiche, en **portrait**, et le reste quand tu tournes le téléphone.
- [ ] L'écran est **plein** : pas de barre d'état (heure, batterie) ni de boutons de navigation en bas. Un glissement depuis le haut ou le bas les fait revenir un instant, puis ils disparaissent.
- [ ] Le déplacement à un doigt, le zoom en pinçant et la rotation à deux doigts sont **fluides**.
- [ ] L'écran **ne s'éteint pas** tout seul pendant que le jeu est ouvert, même sans le toucher plusieurs minutes.

### La sauvegarde survit à la fermeture

Le parc est encore vide : rien ne change à l'écran. Pour voir la sauvegarde, on regarde directement ses fichiers sur le téléphone, avec Android Studio. Le téléphone doit être branché.

1. Lance l'app depuis Android Studio (étape 4) et laisse-la ouverte **au moins une minute**.
2. Dans Android Studio : menu **View** → **Tool Windows** → **Device Explorer**.
3. Ouvre les dossiers `data` → `data` → `com.gardenofearth.zoorefuge` → `files` → `zoo-refuge`.
4. Tu dois y voir des fichiers `save.copy.1`, `save.copy.2`… Clic droit sur le dossier → **Synchronize** pour rafraîchir la liste.
5. Double-clique sur la copie au **plus grand numéro**. Cherche `timeMs` (Ctrl+F) et note le nombre qui suit : c'est le temps de jeu du parc, en millisecondes.
6. **Ferme complètement l'app** : bouton des applications récentes du téléphone, puis balaie Zoo Refuge vers le haut.
7. Relance Zoo Refuge depuis l'écran d'accueil et attends une minute.
8. Dans le Device Explorer, refais **Synchronize**, puis ouvre la nouvelle copie au plus grand numéro.
9. ✅ Réussi si son `timeMs` est **plus grand** que le nombre noté : le parc a repris là où il était. ❌ S'il est plus petit, le parc est reparti de zéro : signale-le.

Le jeu sauvegarde toutes les 30 secondes de jeu et chaque fois que l'app quitte l'écran.

---

## En cas de problème

**Le téléphone n'apparaît pas dans la liste d'Android Studio.**

- Vérifie que le téléphone est déverrouillé et que tu as bien touché **Autoriser** (étape 2.3).
- Essaie un autre câble, ou un autre port USB du PC.
- Sur le téléphone, tire le volet des notifications, touche la notification USB et choisis **Transfert de fichiers**.
- Sur certains téléphones (Samsung notamment), Windows a besoin du pilote USB de la marque : cherche « pilote USB » suivi de la marque du téléphone sur le site du fabricant.

**`npm run android` affiche une erreur.**

Lance `npm install`, puis réessaie. Si l'erreur reste, copie tout le texte du terminal et transmets-le.

**Android Studio affiche une erreur rouge « Gradle » ou « SDK ».**

Menu **File** → **Sync Project with Gradle Files**, puis réessaie. Si ça ne suffit pas, fais une capture d'écran de l'erreur et transmets-la.

**L'app s'ouvre sur un écran blanc ou se ferme aussitôt.**

Relance `npm run android`, puis le triangle vert ▶. Si ça recommence, ouvre l'onglet **Logcat** en bas d'Android Studio, copie les lignes rouges et transmets-les.

**Voir les messages du jeu (pour le développeur).**

Avec le téléphone branché et l'app ouverte, ouvre Chrome sur le PC à l'adresse `chrome://inspect`, puis clique sur **inspect** sous Zoo Refuge. L'onglet **Console** affiche les messages du jeu.
