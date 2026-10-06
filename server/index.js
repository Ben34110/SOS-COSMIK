const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { rooms, createRoom, getRoom, addPlayer, removePlayerBySocket } = require('./rooms');
const { startGame, applyAction, publicGameState, MIN_PLAYERS, MAX_PLAYERS } = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

function personalState(room, player) {
  const base = publicGameState(room);
  return {
    ...base,
    you: {
      id: player.id,
      isAdmin: player.isAdmin,
      hand: player.hand,
      keys: player.keys,
      shield: !!player.shield,
    },
    roomCode: room.code,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  };
}

function broadcastRoom(room) {
  for (const p of room.players) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('state', personalState(room, p));
    }
  }
}

io.on('connection', (socket) => {
  let currentRoomCode = null;
  let currentPlayerId = null;

  socket.on('create_room', ({ name }, cb) => {
    const room = createRoom();
    const { player, error } = addPlayer(room, { name, socketId: socket.id });
    if (error) {
      cb && cb({ error });
      return;
    }
    currentRoomCode = room.code;
    currentPlayerId = player.id;
    socket.join(room.code);
    cb && cb({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, name, playerId }, cb) => {
    const room = getRoom(code);
    if (!room) {
      cb && cb({ error: 'Salle introuvable. Verifie le code.' });
      return;
    }
    const { player, error } = addPlayer(room, { name, playerId, socketId: socket.id });
    if (error || !player) {
      cb && cb({ error: error || 'Impossible de rejoindre la salle.' });
      return;
    }
    currentRoomCode = room.code;
    currentPlayerId = player.id;
    socket.join(room.code);
    cb && cb({ roomCode: room.code, playerId: player.id });
    broadcastRoom(room);
  });

  socket.on('start_game', ({ code, playerId }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ error: 'Salle introuvable.' });
    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.isAdmin) {
      return cb && cb({ error: "Seul l'administrateur peut lancer la partie." });
    }
    const activeCount = room.players.filter((p) => p.connected).length;
    if (activeCount < MIN_PLAYERS) {
      return cb && cb({ error: `Il faut au moins ${MIN_PLAYERS} joueurs pour lancer la partie.` });
    }
    if (room.game.status === 'playing') {
      return cb && cb({ error: 'La partie est deja en cours.' });
    }
    startGame(room);
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  socket.on('player_action', ({ code, playerId, action }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ error: 'Salle introuvable.' });
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return cb && cb({ error: 'Joueur introuvable.' });
    const result = applyAction(room, player, action);
    cb && cb(result || {});
    broadcastRoom(room);
  });

  socket.on('request_state', ({ code, playerId }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ error: 'Salle introuvable.' });
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return cb && cb({ error: 'Joueur introuvable.' });
    player.connected = true;
    player.socketId = socket.id;
    currentRoomCode = room.code;
    currentPlayerId = player.id;
    socket.join(room.code);
    cb && cb({ ok: true });
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    removePlayerBySocket(room, socket.id);
    if (rooms.has(room.code)) {
      broadcastRoom(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`S.O.S. Cosmik lance sur http://localhost:${PORT}`);
});
