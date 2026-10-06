const socket = io();

function goToRoom(roomCode, playerId) {
  localStorage.setItem('sos_room_' + roomCode, playerId);
  window.location.href = `game.html?room=${roomCode}`;
}

function withLoadingState(btn, errorEl, label) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Connexion au serveur...';
  errorEl.textContent = '';

  const slowHintTimer = setTimeout(() => {
    errorEl.textContent = "Le serveur se réveille (jusqu'à 30-50s après une période d'inactivité)... merci de patienter.";
    errorEl.style.color = 'var(--cyan)';
  }, 4000);

  const timeoutTimer = setTimeout(() => {
    cleanup();
    errorEl.style.color = 'var(--red)';
    errorEl.textContent = "Le serveur ne répond toujours pas. Vérifie ta connexion et réessaie dans quelques secondes.";
  }, 60000);

  function cleanup() {
    clearTimeout(slowHintTimer);
    clearTimeout(timeoutTimer);
    btn.disabled = false;
    btn.textContent = originalText;
  }

  return { done: cleanup };
}

socket.on('connect_error', () => {
  console.warn('Socket.IO connect_error — le serveur est peut-être en train de redémarrer.');
});

document.getElementById('create-btn').addEventListener('click', () => {
  const btn = document.getElementById('create-btn');
  const name = document.getElementById('create-name').value.trim();
  const errorEl = document.getElementById('create-error');
  errorEl.textContent = '';
  errorEl.style.color = 'var(--red)';
  if (!name) {
    errorEl.textContent = 'Entre un pseudo pour continuer.';
    return;
  }
  const loading = withLoadingState(btn, errorEl);
  socket.emit('create_room', { name }, (res) => {
    loading.done();
    if (res.error) {
      errorEl.style.color = 'var(--red)';
      errorEl.textContent = res.error;
      return;
    }
    goToRoom(res.roomCode, res.playerId);
  });
});

document.getElementById('join-btn').addEventListener('click', () => {
  const btn = document.getElementById('join-btn');
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const errorEl = document.getElementById('join-error');
  errorEl.textContent = '';
  errorEl.style.color = 'var(--red)';
  if (!name) {
    errorEl.textContent = 'Entre un pseudo pour continuer.';
    return;
  }
  if (!code) {
    errorEl.textContent = 'Entre le code de la salle.';
    return;
  }
  const loading = withLoadingState(btn, errorEl);
  socket.emit('join_room', { name, code }, (res) => {
    loading.done();
    if (res.error) {
      errorEl.style.color = 'var(--red)';
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
