const socket = io();

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
const playerId = roomCode ? localStorage.getItem('sos_room_' + roomCode) : null;

const views = {
  connecting: document.getElementById('view-connecting'),
  waiting: document.getElementById('view-waiting'),
  game: document.getElementById('view-game'),
  ended: document.getElementById('view-ended'),
  error: document.getElementById('view-error'),
};

function showView(name) {
  Object.values(views).forEach((v) => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

function showGlobalError(msg) {
  document.getElementById('global-error').textContent = msg;
  showView('error');
}

if (!roomCode || !playerId) {
  showGlobalError("Impossible de retrouver cette salle. Retourne à l'accueil pour en créer ou en rejoindre une.");
} else {
  showView('connecting');
  const slowHintTimer = setTimeout(() => {
    document.getElementById('connecting-msg').textContent = "Le serveur se réveille (jusqu'à 30-50s après une période d'inactivité)... merci de patienter.";
  }, 4000);
  const timeoutTimer = setTimeout(() => {
    showGlobalError('Le serveur ne répond pas. Vérifie ta connexion et réessaie dans quelques instants.');
  }, 60000);

  socket.emit('request_state', { code: roomCode, playerId }, (res) => {
    clearTimeout(slowHintTimer);
    clearTimeout(timeoutTimer);
    if (res && res.error) {
      showGlobalError(res.error);
    }
  });
}

let selectedCardIds = [];
let lastState = null;
let lastRenderedActionTs = null;

const CARD_IMAGES = {
  energy: { 1: 'images/cards/energie-1.png', 2: 'images/cards/energie-2.png', 3: 'images/cards/energie-3.png' },
  key: 'images/cards/cle.png',
  sabotage: {
    crochepatte: 'images/cards/crochepatte.png',
    surcharge: 'images/cards/surcharge.png',
    coupdecoude: 'images/cards/coupdecoude.png',
    piratage: 'images/cards/piratage.png',
  },
};

const NEEDS_TARGET = ['crochepatte', 'coupdecoude', 'piratage'];

function cardMeta(card) {
  if (card.type === 'energy') {
    return { img: CARD_IMAGES.energy[card.value], label: `Énergie ${card.value}`, icon: '⚡' };
  }
  if (card.type === 'key') {
    return { img: CARD_IMAGES.key, label: 'Clé de sécurité', icon: '🔑' };
  }
  const fallbackIcons = { crochepatte: '🤜', surcharge: '💥', coupdecoude: '🤛', piratage: '🗝️' };
  return { img: CARD_IMAGES.sabotage[card.subtype] || null, label: card.label, icon: fallbackIcons[card.subtype] || '❓' };
}

function cardBackRow(count, max = 8) {
  const shown = Math.min(count, max);
  let html = '<div class="card-back-row">';
  for (let i = 0; i < shown; i++) html += '<span class="card-back-mini"></span>';
  if (count > max) html += `<span class="hint small">+${count - max}</span>`;
  html += '</div>';
  return html;
}

function renderWaiting(state) {
  showView('waiting');
  document.getElementById('room-code-label').textContent = state.roomCode;
  const list = document.getElementById('waiting-player-list');
  list.innerHTML = '';
  state.players.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'player-card' + (p.connected ? '' : ' offline');
    div.innerHTML = `
      <div class="avatar">${p.name.slice(0, 2).toUpperCase()}</div>
      <div class="name">${escapeHtml(p.name)}${p.id === state.you.id ? ' (toi)' : ''}</div>
      ${p.isAdmin ? '<div class="badge">👑 Admin</div>' : ''}
      ${!p.connected ? '<div class="badge" style="background:rgba(255,92,92,0.15);color:#ff5c5c;">Déconnecté</div>' : ''}
    `;
    list.appendChild(div);
  });

  const activeCount = state.players.filter((p) => p.connected).length;
  const startBtn = document.getElementById('start-btn');
  const minHint = document.getElementById('min-players-hint');
  const waitingHint = document.getElementById('waiting-hint');

  if (state.you.isAdmin) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = activeCount < state.minPlayers;
    waitingHint.textContent = "Tu es l'administrateur de cette salle. Lance la partie quand tout le monde est prêt.";
  } else {
    startBtn.classList.add('hidden');
    waitingHint.textContent = "En attente que l'administrateur lance la partie...";
  }
  minHint.textContent = `${activeCount} / ${state.maxPlayers} joueurs connectés (minimum ${state.minPlayers} pour lancer)`;
}

function renderGame(state) {
  showView('game');
  document.getElementById('game-room-code').textContent = state.roomCode;
  document.getElementById('energy-label').textContent = `${state.energyTotal} / ${state.energyTarget}`;
  document.getElementById('energy-fill').style.width = `${Math.min(100, (state.energyTotal / state.energyTarget) * 100)}%`;
  document.getElementById('deck-count').textContent = state.deckCount;

  const isMyTurn = state.currentPlayerId === state.you.id;
  const banner = document.getElementById('turn-banner');
  if (isMyTurn) {
    banner.textContent = "C'est ton tour ! Choisis une action.";
    banner.classList.add('my-turn');
  } else {
    const cp = state.players.find((p) => p.id === state.currentPlayerId);
    banner.textContent = cp ? `Tour de ${cp.name}...` : '';
    banner.classList.remove('my-turn');
  }

  const strip = document.getElementById('players-strip');
  strip.innerHTML = '';
  state.players.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip'
      + (p.id === state.currentPlayerId ? ' active-turn' : '')
      + (p.connected ? '' : ' offline');
    chip.innerHTML = `
      <div class="chip-name">${p.isAdmin ? '👑 ' : ''}${escapeHtml(p.name)}${p.id === state.you.id ? ' (toi)' : ''}</div>
      <div class="chip-stats"><span>Main : ${p.handCount}</span><span class="keys-badge" data-player-id="${p.id}">🔑 ${p.keysCount}</span></div>
      ${p.id === state.you.id ? '' : cardBackRow(p.handCount)}
    `;
    strip.appendChild(chip);
  });

  const logList = document.getElementById('log-list');
  logList.innerHTML = '';
  state.log.slice().reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.text;
    logList.appendChild(li);
  });

  renderLastAction(state);

  const hand = document.getElementById('hand');
  hand.innerHTML = '';
  state.you.hand.forEach((card) => {
    const meta = cardMeta(card);
    const div = document.createElement('div');
    const selectedCls = selectedCardIds.includes(card.id) ? ' selected' : '';
    if (meta.img) {
      div.className = `card card-img${selectedCls}`;
      div.style.backgroundImage = `url('${meta.img}')`;
      div.title = meta.label;
    } else {
      div.className = `card sabotage${selectedCls}`;
      div.innerHTML = `<div class="icon">${meta.icon}</div><div>${meta.label}</div>`;
    }
    div.addEventListener('click', () => {
      if (!isMyTurn) return;
      toggleSelect(card.id);
    });
    hand.appendChild(div);
  });

  renderActionBar(state, isMyTurn);
}

function renderLastAction(state) {
  const panel = document.getElementById('last-action-panel');
  const la = state.lastAction;

  if (!la) {
    panel.innerHTML = '<p class="hint">En attente de la première action...</p>';
    panel.classList.remove('key-event');
    return;
  }

  const isNew = la.ts !== lastRenderedActionTs;
  lastRenderedActionTs = la.ts;

  let cardHtml = '';
  if (la.card) {
    const meta = cardMeta(la.card);
    if (meta.img) {
      cardHtml = `<div class="la-card" style="background-image:url('${meta.img}')"></div>`;
    } else {
      cardHtml = `<div class="la-card card sabotage" style="display:flex;align-items:center;justify-content:center;"><div class="icon">${meta.icon}</div></div>`;
    }
  }
  const extra = la.cardsCount && la.cardsCount > 1 ? ` <span class="hint small">(+${la.cardsCount - 1} autre${la.cardsCount > 2 ? 's' : ''})</span>` : '';

  panel.innerHTML = `
    ${cardHtml}
    <div class="la-text">
      <span class="la-player">${escapeHtml(la.playerName)}</span> ${escapeHtml(la.text)}${la.targetName ? ` → ${escapeHtml(la.targetName)}` : ''}${extra}
      <span class="la-sub">${escapeHtml(la.sub || '')}</span>
    </div>
  `;

  panel.classList.toggle('key-event', !!la.isKeyEvent);

  if (isNew) {
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');

    if (la.isKeyEvent && la.playerId) {
      const badge = document.querySelector(`.keys-badge[data-player-id="${la.playerId}"]`);
      if (badge) {
        badge.classList.remove('key-flash');
        void badge.offsetWidth;
        badge.classList.add('key-flash');
      }
    }
  }
}

function toggleSelect(cardId) {
  const idx = selectedCardIds.indexOf(cardId);
  if (idx !== -1) {
    selectedCardIds.splice(idx, 1);
  } else {
    if (selectedCardIds.length >= 2) selectedCardIds.shift();
    selectedCardIds.push(cardId);
  }
  document.getElementById('action-error').textContent = '';
  renderGame(lastState);
}

function renderActionBar(state, isMyTurn) {
  const bar = document.getElementById('action-bar');
  bar.innerHTML = '';
  if (!isMyTurn) {
    bar.innerHTML = '<p class="hint">Attends ton tour pour agir.</p>';
    return;
  }

  if (selectedCardIds.length === 0) {
    bar.innerHTML = '<p class="hint">Sélectionne 1 carte pour jouer une action, ou jusqu\'à 2 cartes pour les défausser.</p>';
    return;
  }

  if (selectedCardIds.length === 1) {
    const card = state.you.hand.find((c) => c.id === selectedCardIds[0]);
    if (card) {
      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-primary';
      if (card.type === 'energy') {
        playBtn.textContent = `⚡ Contribuer au moteur (+${card.value})`;
        playBtn.addEventListener('click', () => sendAction({ type: 'contribuer', cardId: card.id }));
      } else if (card.type === 'key') {
        playBtn.textContent = '🔑 Sécuriser ma place';
        playBtn.addEventListener('click', () => sendAction({ type: 'securiser', cardId: card.id }));
      } else if (card.type === 'sabotage') {
        const meta = cardMeta(card);
        playBtn.textContent = `${meta.icon} Jouer : ${meta.label}`;
        playBtn.addEventListener('click', () => {
          if (NEEDS_TARGET.includes(card.subtype)) {
            openTargetModal(state, card);
          } else {
            sendAction({ type: 'sabotage', cardId: card.id });
          }
        });
      }
      bar.appendChild(playBtn);
    }
  }

  const discardBtn = document.createElement('button');
  discardBtn.className = 'btn btn-secondary';
  discardBtn.textContent = `🗑️ Défausser et repiocher (${selectedCardIds.length}/2)`;
  discardBtn.addEventListener('click', () => sendAction({ type: 'defausser', cardIds: selectedCardIds.slice() }));
  bar.appendChild(discardBtn);
}

function openTargetModal(state, card) {
  const modal = document.getElementById('target-modal');
  const title = document.getElementById('target-modal-title');
  const list = document.getElementById('target-list');
  const meta = cardMeta(card);
  title.textContent = `${meta.icon} ${meta.label} — choisis une cible`;
  list.innerHTML = '';
  state.players
    .filter((p) => p.id !== state.you.id && p.connected)
    .forEach((p) => {
      const btn = document.createElement('button');
      btn.textContent = `${escapeHtml(p.name)} (🂠 ${p.handCount} · 🔑 ${p.keysCount})`;
      btn.addEventListener('click', () => {
        modal.classList.add('hidden');
        sendAction({ type: 'sabotage', cardId: card.id, targetId: p.id });
      });
      list.appendChild(btn);
    });
  modal.classList.remove('hidden');
}

document.getElementById('target-cancel').addEventListener('click', () => {
  document.getElementById('target-modal').classList.add('hidden');
});

function sendAction(action) {
  socket.emit('player_action', { code: roomCode, playerId, action }, (res) => {
    if (res && res.error) {
      document.getElementById('action-error').textContent = res.error;
      return;
    }
    selectedCardIds = [];
  });
}

const WINNER_TITLES = {
  collective: '🚀 Victoire Collective',
  solo: '⚡ Victoire Solo Éclair',
  chaos: '💥 Victoire par Chaos',
};

function renderEnded(state) {
  showView('ended');
  document.getElementById('end-title').textContent = WINNER_TITLES[state.winner.type] || 'Fin de partie';
  document.getElementById('end-reason').textContent = state.winner.reason;
  const winnersEl = document.getElementById('end-winners');
  winnersEl.innerHTML = '';
  if (state.winner.playerIds.length === 0) {
    winnersEl.innerHTML = '<p class="hint">Personne ne s\'échappe...</p>';
  } else {
    state.winner.playerIds.forEach((id) => {
      const p = state.players.find((pl) => pl.id === id);
      if (!p) return;
      const pill = document.createElement('span');
      pill.className = 'winner-pill';
      pill.textContent = `🏆 ${p.name}`;
      winnersEl.appendChild(pill);
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

socket.on('state', (state) => {
  lastState = state;
  selectedCardIds = selectedCardIds.filter((id) => state.you.hand.some((c) => c.id === id));
  if (state.status === 'waiting') {
    renderWaiting(state);
  } else if (state.status === 'playing') {
    renderGame(state);
  } else if (state.status === 'ended') {
    renderEnded(state);
  }
});

const startBtn = document.getElementById('start-btn');
if (startBtn) {
  startBtn.addEventListener('click', () => {
    document.getElementById('start-error').textContent = '';
    socket.emit('start_game', { code: roomCode, playerId }, (res) => {
      if (res && res.error) {
        document.getElementById('start-error').textContent = res.error;
      }
    });
  });
}

const copyBtn = document.getElementById('copy-code-btn');
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    if (lastState) {
      navigator.clipboard.writeText(lastState.roomCode).catch(() => {});
      copyBtn.textContent = 'Copié !';
      setTimeout(() => { copyBtn.textContent = 'Copier le code'; }, 1500);
    }
  });
}
