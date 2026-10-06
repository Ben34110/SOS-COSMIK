const socket = io();

function goToRoom(roomCode, playerId) {
  localStorage.setItem('sos_room_' + roomCode, playerId);
  window.location.href = `game.html?room=${roomCode}`;
}

document.getElementById('create-btn').addEventListener('click', () => {
  const name = document.getElementById('create-name').value.trim();
  const errorEl = document.getElementById('create-error');
  errorEl.textContent = '';
  if (!name) {
    errorEl.textContent = 'Entre un pseudo pour continuer.';
    return;
  }
  socket.emit('create_room', { name }, (res) => {
    if (res.error) {
      errorEl.textContent = res.error;
      return;
    }
    goToRoom(res.roomCode, res.playerId);
  });
});

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const errorEl = document.getElementById('join-error');
  errorEl.textContent = '';
  if (!name) {
    errorEl.textContent = 'Entre un pseudo pour continuer.';
    return;
  }
  if (!code) {
    errorEl.textContent = 'Entre le code de la salle.';
    return;
  }
  socket.emit('join_room', { name, code }, (res) => {
    if (res.error) {
      errorEl.textContent = res.error;
      return;
    }
    goToRoom(res.roomCode, res.playerId);
  });
});

document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

['create-name', 'join-name', 'join-code'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const btnId = id.startsWith('create') ? 'create-btn' : 'join-btn';
      document.getElementById(btnId).click();
    }
  });
});
