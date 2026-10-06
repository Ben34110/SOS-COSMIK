const { createGameState, MAX_PLAYERS } = require('./gameEngine');

const rooms = new Map(); // code -> room

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function generatePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    players: [],
    game: createGameState(),
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

function deleteRoomIfEmpty(room) {
  const anyoneLeft = room.players.some((p) => p.connected);
  if (!anyoneLeft) {
    rooms.delete(room.code);
  }
}

function addPlayer(room, { name, playerId, socketId }) {
  if (playerId) {
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      return { player: existing, error: null };
    }
  }

  if (room.game.status === 'playing') {
    return { player: null, error: 'La partie est deja en cours.' };
  }
  const activeCount = room.players.filter((p) => p.connected).length;
  if (activeCount >= MAX_PLAYERS) {
    return { player: null, error: 'La salle est pleine (8 joueurs maximum).' };
  }

  const isAdmin = room.players.length === 0;
  const player = {
    id: generatePlayerId(),
    socketId,
    name: (name || 'Joueur').slice(0, 20),
    isAdmin,
    connected: true,
    hand: [],
    keys: [],
    shield: false,
  };
  room.players.push(player);
  return { player, error: null };
}

function removePlayerBySocket(room, socketId) {
  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) return null;
  player.connected = false;
  player.socketId = null;

  if (player.isAdmin) {
    const nextAdmin = room.players.find((p) => p.connected);
    if (nextAdmin) nextAdmin.isAdmin = true;
  }

  if (room.game.status === 'waiting') {
    room.players = room.players.filter((p) => p.id !== player.id);
  }

  deleteRoomIfEmpty(room);
  return player;
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  addPlayer,
  removePlayerBySocket,
};
