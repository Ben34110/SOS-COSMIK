# S.O.S. Cosmik — version web

Version jouable en ligne du jeu de société *S.O.S. Cosmik* (4 à 8 joueurs, semi-coopératif, bluff et coups bas).

Inspiré du prototype [cosmik-escape-chaos.lovable.app](https://cosmik-escape-chaos.lovable.app), reconstruit ici avec un vrai serveur temps réel : salle d'attente partagée, lancement de partie par l'administrateur, et plateau visible en direct par tous les joueurs.

## Lancer le jeu en local

```bash
npm install
npm start
```

Puis ouvrir [http://localhost:3000](http://localhost:3000) dans plusieurs onglets/navigateurs (un par joueur).

## Déroulement

1. **Créer une salle** : le premier joueur devient automatiquement administrateur et reçoit un code de salle à 5 caractères à partager.
2. **Rejoindre une salle** : les autres joueurs entrent leur pseudo + le code, et atterrissent dans la salle d'attente (4 à 8 joueurs).
3. **Lancer la partie** : seul l'administrateur voit le bouton "🚀 Lancer la partie", actif à partir de 4 joueurs connectés.
4. **Jouer** : chaque joueur pioche automatiquement en début de tour, puis choisit une seule action — contribuer au moteur, sécuriser sa place, jouer un coup bas, ou défausser/recharger. Le plateau (moteur d'énergie, clés, mains des autres, journal des événements) est visualisé en direct pour tout le monde via Socket.IO.
5. **Fin de partie** : la victoire Collective, Solo Éclair ou par Chaos est détectée automatiquement et affichée à tous.

## Architecture

- `server/index.js` — serveur Express + Socket.IO, gère les connexions et diffuse l'état de salle à chaque joueur.
- `server/rooms.js` — création des salles, gestion des joueurs (connexion/déconnexion, admin).
- `server/gameEngine.js` — règles du jeu : deck de 60 cartes, tours, actions, conditions de victoire.
- `public/` — front-end statique (HTML/CSS/JS vanilla, sans build) : accueil, salle d'attente + plateau de jeu, écran de fin.

L'état de la partie vit en mémoire côté serveur (pas de base de données) : simple et suffisant pour un prototype jouable entre amis.
