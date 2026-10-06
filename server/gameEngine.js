// Moteur de jeu pour S.O.S. Cosmik
// 60 cartes : 28 Énergie (10x1, 10x2, 8x3), 20 Sabotage (5 Croche-patte, 5 Bouclier,
// 5 Surcharge, 4 Coup de coude, 1 Piratage d'accès), 12 Clé de sécurité.

const ENERGY_TARGET = 30;
const KEYS_TO_WIN_SOLO = 4;
const KEYS_TO_ESCAPE_COLLECTIVE = 2;
const STARTING_HAND = 4;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

let cardIdCounter = 1;
function nextCardId() {
  return 'c' + (cardIdCounter++);
}

function buildDeck() {
  const cards = [];

  const energyValues = [
    ...Array(10).fill(1),
    ...Array(10).fill(2),
    ...Array(8).fill(3),
  ];
  for (const value of energyValues) {
    cards.push({ id: nextCardId(), type: 'energy', value, label: `Énergie ${value}` });
  }

  const sabotageCounts = {
    crochepatte: 5,
    bouclier: 5,
    surcharge: 5,
    coupdecoude: 4,
    piratage: 1,
  };
  const sabotageLabels = {
    crochepatte: 'Croche-patte',
    bouclier: 'Bouclier',
    surcharge: 'Surcharge',
    coupdecoude: 'Coup de coude',
    piratage: "Piratage d'accès",
  };
  for (const [subtype, count] of Object.entries(sabotageCounts)) {
    for (let i = 0; i < count; i++) {
      cards.push({ id: nextCardId(), type: 'sabotage', subtype, label: sabotageLabels[subtype] });
    }
  }

  for (let i = 0; i < 12; i++) {
    cards.push({ id: nextCardId(), type: 'key', label: 'Clé de sécurité' });
  }

  return cards;
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createGameState() {
  return {
    status: 'waiting', // waiting | playing | ended
    deck: [],
    discard: [],
    engine: [], // cartes Énergie posees sur le moteur (pile visible)
    energyTotal: 0,
    turnOrder: [],
    turnIndex: 0,
    log: [],
    winner: null,
  };
}

function addLog(game, text) {
  game.log.push({ text, ts: Date.now() });
  if (game.log.length > 30) game.log.shift();
}

function startGame(room) {
  const game = room.game;
  game.deck = shuffle(buildDeck());
  game.discard = [];
  game.engine = [];
  game.energyTotal = 0;
  game.log = [];
  game.winner = null;

  const players = room.players.filter((p) => p.connected);
  game.turnOrder = shuffle(players.map((p) => p.id));
  game.turnIndex = 0;

  for (const p of room.players) {
    p.hand = [];
    p.keys = [];
    p.shield = false;
  }

  for (let i = 0; i < STARTING_HAND; i++) {
    for (const pid of game.turnOrder) {
      const player = room.players.find((p) => p.id === pid);
      const card = game.deck.pop();
      if (card) player.hand.push(card);
    }
  }

  game.status = 'playing';
  addLog(game, 'La partie commence ! Le vaisseau explose dans 5 minutes...');

  drawForCurrentPlayer(room);
}

function currentPlayer(room) {
  const game = room.game;
  if (!game.turnOrder.length) return null;
  const pid = game.turnOrder[game.turnIndex % game.turnOrder.length];
  return room.players.find((p) => p.id === pid) || null;
}

function drawForCurrentPlayer(room) {
  const game = room.game;
  const player = currentPlayer(room);
  if (!player) return;

  if (game.deck.length === 0) {
    triggerChaosEnd(room);
    return;
  }
  const card = game.deck.pop();
  player.hand.push(card);
  addLog(game, `${player.name} pioche une carte.`);
}

function triggerChaosEnd(room) {
  const game = room.game;
  game.status = 'ended';
  let minHand = Infinity;
  for (const p of room.players) {
    if (p.hand.length < minHand) minHand = p.hand.length;
  }
  const winners = room.players.filter((p) => p.hand.length === minHand).map((p) => p.id);
  game.winner = {
    type: 'chaos',
    playerIds: winners,
    reason: 'Le vaisseau a explose avant que le moteur n\'atteigne 30 points d\'energie. Le(s) joueur(s) avec le moins de cartes en main active(nt) leur armure de secours.',
  };
  addLog(game, 'La pioche est épuisée... le vaisseau explose ! (Victoire par Chaos)');
}

function checkWinConditions(room) {
  const game = room.game;
  if (game.status === 'ended') return;

  for (const p of room.players) {
    if (p.keys.length >= KEYS_TO_WIN_SOLO) {
      game.status = 'ended';
      game.winner = {
        type: 'solo',
        playerIds: [p.id],
        reason: `${p.name} a réuni 4 clés de securite et déclenche le verrou d'urgence. Fuite solo dans le mini-pod secret !`,
      };
      addLog(game, `${p.name} déclenche le verrou d'urgence avec 4 cles ! (Victoire Solo Eclair)`);
      return;
    }
  }

  if (game.energyTotal >= ENERGY_TARGET) {
    game.status = 'ended';
    const escapees = room.players.filter((p) => p.keys.length >= KEYS_TO_ESCAPE_COLLECTIVE).map((p) => p.id);
    game.winner = {
      type: 'collective',
      playerIds: escapees,
      reason: escapees.length
        ? 'Le moteur atteint 30 points d\'energie, la capsule décolle ! Les joueurs avec au moins 2 cles s\'échappent ensemble.'
        : 'Le moteur atteint 30 points d\'energie, la capsule décolle... mais personne n\'avait assez de clés pour s\'echapper.',
    };
    addLog(game, 'Le moteur atteint 30 points d\'energie ! La capsule décolle. (Victoire Collective)');
  }
}

function endTurn(room) {
  const game = room.game;
  if (game.status === 'ended') return;
  game.turnIndex = (game.turnIndex + 1) % game.turnOrder.length;
  drawForCurrentPlayer(room);
}

function findOtherPlayer(room, actingPlayer, targetId) {
  return room.players.find((p) => p.id === targetId && p.id !== actingPlayer.id && p.connected);
}

function removeCardFromHand(player, cardId) {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return null;
  return player.hand.splice(idx, 1)[0];
}

// action: { type: 'contribuer'|'securiser'|'sabotage'|'defausser', cardId, targetId, cardIds }
function applyAction(room, player, action) {
  const game = room.game;
  if (game.status !== 'playing') return { error: 'La partie n\'est pas en cours.' };
  const current = currentPlayer(room);
  if (!current || current.id !== player.id) return { error: 'Ce n\'est pas ton tour.' };

  switch (action.type) {
    case 'contribuer': {
      const card = removeCardFromHand(player, action.cardId);
      if (!card || card.type !== 'energy') {
        if (card) player.hand.push(card);
        return { error: 'Carte Énergie invalide.' };
      }
      game.engine.push(card);
      game.energyTotal += card.value;
      addLog(game, `${player.name} contribue au moteur avec une carte Énergie ${card.value} (total: ${game.energyTotal}/${ENERGY_TARGET}).`);
      break;
    }
    case 'securiser': {
      const card = removeCardFromHand(player, action.cardId);
      if (!card || card.type !== 'key') {
        if (card) player.hand.push(card);
        return { error: 'Carte Cle invalide.' };
      }
      player.keys.push(card);
      addLog(game, `${player.name} sécurise sa place avec une Clé de sécurité (${player.keys.length} cle${player.keys.length > 1 ? 's' : ''}).`);
      break;
    }
    case 'sabotage': {
      const card = removeCardFromHand(player, action.cardId);
      if (!card || card.type !== 'sabotage') {
        if (card) player.hand.push(card);
        return { error: 'Carte Sabotage invalide.' };
      }

      const needsTarget = ['crochepatte', 'coupdecoude', 'piratage'].includes(card.subtype);
      let target = null;
      if (needsTarget) {
        target = findOtherPlayer(room, player, action.targetId);
        if (!target) {
          player.hand.push(card);
          return { error: 'Cible invalide.' };
        }
      }

      game.discard.push(card);

      if (card.subtype === 'bouclier') {
        player.shield = true;
        addLog(game, `${player.name} active son Bouclier.`);
        break;
      }

      if (target && target.shield) {
        target.shield = false;
        addLog(game, `${target.name} bloque le ${card.label} de ${player.name} avec son Bouclier !`);
        break;
      }

      if (card.subtype === 'crochepatte') {
        if (target.hand.length === 0) {
          addLog(game, `${player.name} tente un Croche-patte sur ${target.name}, mais sa main est vide.`);
          break;
        }
        const idx = Math.floor(Math.random() * target.hand.length);
        const stolen = target.hand.splice(idx, 1)[0];
        player.hand.push(stolen);
        addLog(game, `${player.name} fait un Croche-patte a ${target.name} et lui vole une carte.`);
      } else if (card.subtype === 'surcharge') {
        if (game.engine.length === 0) {
          addLog(game, `${player.name} joue Surcharge, mais le moteur est vide : aucun effet.`);
          break;
        }
        const destroyed = game.engine.pop();
        game.energyTotal = Math.max(0, game.energyTotal - destroyed.value);
        addLog(game, `${player.name} déclenche une Surcharge et détruit une carte Énergie ${destroyed.value} du moteur (total: ${game.energyTotal}/${ENERGY_TARGET}).`);
      } else if (card.subtype === 'coupdecoude') {
        const tmp = player.hand;
        player.hand = target.hand;
        target.hand = tmp;
        addLog(game, `${player.name} donne un Coup de coude et echange sa main avec ${target.name}.`);
      } else if (card.subtype === 'piratage') {
        if (target.keys.length === 0) {
          addLog(game, `${player.name} tente un Piratage d'accès sur ${target.name}, mais il n'a aucune cle.`);
          break;
        }
        const stolenKey = target.keys.pop();
        player.keys.push(stolenKey);
        addLog(game, `${player.name} pirate l'accès de ${target.name} et lui vole une Clé de sécurité !`);
      }
      break;
    }
    case 'defausser': {
      const ids = Array.isArray(action.cardIds) ? action.cardIds.slice(0, 2) : [];
      if (ids.length === 0) return { error: 'Choisis au moins une carte a defausser.' };
      const discarded = [];
      for (const id of ids) {
        const card = removeCardFromHand(player, id);
        if (card) discarded.push(card);
      }
      for (const card of discarded) game.discard.push(card);
      let drawn = 0;
      for (let i = 0; i < discarded.length; i++) {
        if (game.deck.length === 0) break;
        player.hand.push(game.deck.pop());
        drawn++;
      }
      addLog(game, `${player.name} defausse ${discarded.length} carte(s) et en repioche ${drawn}.`);
      if (game.deck.length === 0 && discarded.length > drawn) {
        checkWinConditions(room);
        if (game.status === 'ended') return {};
      }
      break;
    }
    default:
      return { error: 'Action inconnue.' };
  }

  checkWinConditions(room);
  if (game.status !== 'ended') {
    endTurn(room);
  }
  return {};
}

function publicGameState(room) {
  const game = room.game;
  return {
    status: game.status,
    energyTotal: game.energyTotal,
    energyTarget: ENERGY_TARGET,
    deckCount: game.deck.length,
    engine: game.engine,
    discardTop: game.discard[game.discard.length - 1] || null,
    discardCount: game.discard.length,
    turnOrder: game.turnOrder,
    currentPlayerId: currentPlayer(room)?.id || null,
    log: game.log,
    winner: game.winner,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAdmin: p.isAdmin,
      connected: p.connected,
      handCount: p.hand ? p.hand.length : 0,
      keysCount: p.keys ? p.keys.length : 0,
      shield: !!p.shield,
    })),
  };
}

module.exports = {
  ENERGY_TARGET,
  KEYS_TO_WIN_SOLO,
  KEYS_TO_ESCAPE_COLLECTIVE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  createGameState,
  startGame,
  applyAction,
  publicGameState,
  currentPlayer,
};
