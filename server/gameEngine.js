// Moteur de jeu pour S.O.S. Cosmik
// Deck : 40 Énergie (14x1, 13x2, 13x3), 11 Sabotage (5 Vol de carte, 3 Surcharge,
// 2 Échange de main, 1 Piratage d'accès), + des Clés de sécurité dont le nombre
// est proportionnel au nombre de joueurs (2 par joueur).

const ENERGY_TARGET = 30;
const KEYS_TO_WIN_SOLO = 4;
const KEYS_TO_ESCAPE_COLLECTIVE = 2;
const STARTING_HAND = 4;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const KEYS_PER_PLAYER = 2;

let cardIdCounter = 1;
function nextCardId() {
  return 'c' + (cardIdCounter++);
}

function buildDeck(playerCount) {
  const cards = [];
  const keyCount = Math.max(KEYS_TO_WIN_SOLO, playerCount * KEYS_PER_PLAYER);

  const energyValues = [
    ...Array(14).fill(1),
    ...Array(13).fill(2),
    ...Array(13).fill(3),
  ];
  for (const value of energyValues) {
    cards.push({ id: nextCardId(), type: 'energy', value, label: `Énergie ${value}` });
  }

  const sabotageCounts = {
    crochepatte: 5,
    surcharge: 3,
    coupdecoude: 2,
    piratage: 1,
  };
  const sabotageLabels = {
    crochepatte: 'Vol de carte',
    surcharge: 'Surcharge',
    coupdecoude: 'Échange de main',
    piratage: "Piratage d'accès",
  };
  for (const [subtype, count] of Object.entries(sabotageCounts)) {
    for (let i = 0; i < count; i++) {
      cards.push({ id: nextCardId(), type: 'sabotage', subtype, label: sabotageLabels[subtype] });
    }
  }

  for (let i = 0; i < keyCount; i++) {
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
    lastAction: null,
  };
}

function addLog(game, text) {
  game.log.push({ text, ts: Date.now() });
  if (game.log.length > 30) game.log.shift();
}

function setLastAction(game, data) {
  game.lastAction = { ts: Date.now(), ...data };
}

function startGame(room) {
  const game = room.game;
  const players = room.players.filter((p) => p.connected);
  game.deck = shuffle(buildDeck(players.length));
  game.discard = [];
  game.engine = [];
  game.energyTotal = 0;
  game.log = [];
  game.winner = null;
  game.lastAction = null;

  game.turnOrder = shuffle(players.map((p) => p.id));
  game.turnIndex = 0;

  for (const p of room.players) {
    p.hand = [];
    p.keys = [];
  }

  for (let i = 0; i < STARTING_HAND; i++) {
    for (const pid of game.turnOrder) {
      const player = room.players.find((p) => p.id === pid);
      const card = game.deck.pop();
      if (card) player.hand.push(card);
    }
  }

  const keyCount = game.deck.filter((c) => c.type === 'key').length;
  game.status = 'playing';
  addLog(game, `La partie commence avec ${players.length} joueurs et ${keyCount} Clés de sécurité dans le deck ! Le vaisseau explose dans 5 minutes...`);
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

  let maxKeys = -1;
  for (const p of room.players) {
    if (p.keys.length > maxKeys) maxKeys = p.keys.length;
  }
  const topKeyPlayers = room.players.filter((p) => p.keys.length === maxKeys);

  let minHand = Infinity;
  for (const p of topKeyPlayers) {
    if (p.hand.length < minHand) minHand = p.hand.length;
  }
  const winners = topKeyPlayers.filter((p) => p.hand.length === minHand).map((p) => p.id);

  game.winner = {
    type: 'chaos',
    playerIds: winners,
    reason: 'La pioche est épuisée avant que le moteur n\'atteigne 30 points d\'Énergie. Le joueur avec le plus de Clés de sécurité posées gagne seul (égalité départagée par le moins de cartes en main).',
  };
  addLog(game, 'La pioche est épuisée... Victoire par Chaos au nombre de Clés de sécurité !');
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
        reason: `${p.name} a réuni 4 Clés de sécurité et gagne seul, mettant fin instantanément à la partie !`,
      };
      addLog(game, `${p.name} réunit 4 Clés de sécurité ! (Victoire Solo Éclair)`);
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
        ? 'Le moteur atteint 30 points d\'Énergie ! Les joueurs avec au moins 2 Clés de sécurité s\'échappent et gagnent ensemble.'
        : 'Le moteur atteint 30 points d\'Énergie... mais personne n\'avait assez de Clés de sécurité, tout le monde perd.',
    };
    addLog(game, 'Le moteur atteint 30 points d\'energie ! La capsule décolle. (Victoire Collective)');
  }
}

function endTurn(room) {
  const game = room.game;
  if (game.status === 'ended') return;
  game.turnIndex = (game.turnIndex + 1) % game.turnOrder.length;
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
      setLastAction(game, {
        playerName: player.name, playerId: player.id,
        type: 'contribuer',
        card,
        text: `contribue au moteur`,
        sub: `+${card.value} Énergie (${game.energyTotal}/${ENERGY_TARGET})`,
      });
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
      setLastAction(game, {
        playerName: player.name, playerId: player.id,
        type: 'securiser',
        card,
        text: `sécurise sa place`,
        sub: `🔑 ${player.keys.length} clé${player.keys.length > 1 ? 's' : ''} sécurisée${player.keys.length > 1 ? 's' : ''}`,
        isKeyEvent: true,
      });
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

      if (card.subtype === 'crochepatte') {
        if (target.hand.length === 0) {
          const text = `${player.name} tente un Vol de carte sur ${target.name}, mais sa main est vide.`;
          addLog(game, text);
          setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, targetName: target.name, text: 'joue Vol de carte', sub: `${target.name} n'avait aucune carte` });
          break;
        }
        const idx = Math.floor(Math.random() * target.hand.length);
        const stolen = target.hand.splice(idx, 1)[0];
        player.hand.push(stolen);
        addLog(game, `${player.name} fait un Vol de carte à ${target.name} et lui vole une carte.`);
        setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, targetName: target.name, text: 'joue Vol de carte', sub: `vole une carte à ${target.name}` });
      } else if (card.subtype === 'surcharge') {
        if (game.energyTotal === 0) {
          const text = `${player.name} joue Surcharge, mais le moteur est déjà à 0 : aucun effet.`;
          addLog(game, text);
          setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, text: 'joue Surcharge', sub: 'le moteur était déjà à 0' });
          break;
        }
        const removed = Math.min(10, game.energyTotal);
        game.energyTotal -= removed;
        addLog(game, `${player.name} déclenche une Surcharge et détruit ${removed} points d'Énergie du moteur (total: ${game.energyTotal}/${ENERGY_TARGET}).`);
        setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, text: 'joue Surcharge', sub: `-${removed} Énergie (${game.energyTotal}/${ENERGY_TARGET})` });
      } else if (card.subtype === 'coupdecoude') {
        const tmp = player.hand;
        player.hand = target.hand;
        target.hand = tmp;
        addLog(game, `${player.name} déclenche un Échange de main avec ${target.name}.`);
        setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, targetName: target.name, text: 'joue Échange de main', sub: `échange sa main avec ${target.name}` });
      } else if (card.subtype === 'piratage') {
        if (target.keys.length === 0) {
          const text = `${player.name} tente un Piratage d'accès sur ${target.name}, mais il n'a aucune cle.`;
          addLog(game, text);
          setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, targetName: target.name, text: "joue Piratage d'accès", sub: `${target.name} n'avait aucune clé` });
          break;
        }
        const stolenKey = target.keys.pop();
        player.keys.push(stolenKey);
        addLog(game, `${player.name} pirate l'accès de ${target.name} et lui vole une Clé de sécurité !`);
        setLastAction(game, { playerName: player.name, playerId: player.id, type: 'sabotage', card, targetName: target.name, text: "joue Piratage d'accès", sub: `vole une clé à ${target.name}`, isKeyEvent: true });
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
      setLastAction(game, {
        playerName: player.name, playerId: player.id,
        type: 'defausser',
        card: discarded[0] || null,
        cardsCount: discarded.length,
        text: 'défausse et recharge',
        sub: `${discarded.length} carte(s) défaussée(s), ${drawn} repiochée(s)`,
      });
      if (game.deck.length === 0 && discarded.length > drawn) {
        triggerChaosEnd(room);
        return {};
      }
      break;
    }
    default:
      return { error: 'Action inconnue.' };
  }

  checkWinConditions(room);
  if (game.status !== 'ended') {
    // On pioche après avoir joué (pas avant), sauf pour "défausser" qui gère déjà sa propre pioche.
    if (action.type !== 'defausser') {
      drawForCurrentPlayer(room);
    }
    if (game.status !== 'ended') {
      endTurn(room);
    }
  }
  return {};
}

function publicGameState(room) {
  const game = room.game;
  const orderedPlayers = game.turnOrder.length
    ? game.turnOrder.map((pid) => room.players.find((p) => p.id === pid)).filter(Boolean)
    : room.players;

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
    lastAction: game.lastAction,
    players: orderedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      isAdmin: p.isAdmin,
      connected: p.connected,
      handCount: p.hand ? p.hand.length : 0,
      keysCount: p.keys ? p.keys.length : 0,
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
