/* Fixed 1600 × 900 world. The complete scene and UI scale together at 16:9. */
(() => {
  'use strict';
  const frame = document.querySelector('#game');
  const player = document.querySelector('#player');
  const body = player.querySelector('.player-body');
  const prompt = document.querySelector('#interact-prompt');
  const destination = document.querySelector('#destination');
  const dialogue = document.querySelector('#dialogue-panel');
  const wardrobe = document.querySelector('#wardrobe-panel');
  const caption = document.querySelector('#world-caption');
  const modalElement = document.querySelector('#modal');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spots = {
    home: { x: 195, y: 650, radius: 145, name: '旧宅' },
    troupe: { x: 495, y: 620, radius: 135, name: '春和戏班' },
    stage: { x: 815, y: 615, radius: 145, name: '古戏台' },
    tea: { x: 1200, y: 665, radius: 135, name: '听雨茶楼' },
    shop: { x: 1450, y: 690, radius: 125, name: '云裳布庄' }
  };
  const keys = new Set();
  const directions = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
    ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] };
  let position = { x: 245, y: 655 }, target = null, nearby = null;
  let face = 1, walkTime = 0, accumulator = 0, lastTime = performance.now(), saveTimer;
  let open = true, stopped = false;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Collision uses the feet rather than the sprite's head. All scenery lies
  // behind this courtyard boundary, with foliage at the front two corners.
  function floorTop(x) {
    if (x < 280) return 610;
    if (x > 1370) return 645;
    return 590;
  }
  function constrain(p) {
    const x = clamp(p.x, 65, 1535);
    let y = clamp(p.y, floorTop(x), 795);
    if (x < 170) y = Math.min(y, 750);
    if (x > 1450) y = Math.min(y, 755);
    return { x, y };
  }
  function readPosition() {
    const saved = state.player;
    position = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? constrain(saved) : { x: 245, y: 655 };
    state.player = { ...position };
  }
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { state.player = { ...position }; save(); }, 220);
  }
  function setOpen(value) {
    open = value;
    dialogue.classList.toggle('is-open', open);
    caption.hidden = open;
  }
  function blocked() {
    return modalElement.open || !wardrobe.hidden || document.hidden;
  }
  function nearestSpot() {
    let found = null, distance = Infinity;
    for (const [id, spot] of Object.entries(spots)) {
      const d = Math.hypot(position.x - spot.x, position.y - spot.y);
      if (d <= spot.radius && d < distance) { found = id; distance = d; }
    }
    return found;
  }
  function updatePrompt() {
    nearby = nearestSpot();
    prompt.hidden = !nearby || blocked() || !!target || open;
    if (nearby) {
      prompt.querySelector('span').textContent = spots[nearby].name + ' · 交互';
      prompt.style.left = position.x / 16 + '%';
      prompt.style.top = (position.y - 210) / 9 + '%';
    }
    document.querySelectorAll('[data-place]').forEach(button => {
      const active = open && button.dataset.place === state.place;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function draw(moving) {
    player.style.left = position.x / 16 + '%';
    player.style.top = position.y / 9 + '%';
    const bob = moving && !reduceMotion ? Math.abs(Math.sin(walkTime * 12)) * 3 : 0;
    body.style.transform = `translateY(${-bob}px) scaleX(${face})`;
    player.style.setProperty('--leg-swing', (moving && !reduceMotion ? Math.sin(walkTime * 12) * 16 : 0) + 'deg');
    player.classList.toggle('walking', moving);
    // Sort the feet against NPCs, leaving UI on its own higher layer.
    player.style.zIndex = position.y < 630 ? '15' : '20';
    state.player = { ...position };
    updatePrompt();
  }
  function clearInput() { keys.clear(); }
  function cancelTravel() { target = null; destination.hidden = true; }
  function interact(id = nearestSpot()) {
    if (blocked() || !id || !spots[id]) return;
    const spot = spots[id];
    if (Math.hypot(position.x - spot.x, position.y - spot.y) > spot.radius) {
      say('先走近' + spot.name + '，再按 E 交互。'); return;
    }
    clearInput(); cancelTravel(); state.place = id; setOpen(true); render(); draw(false);
  }
  function navigate(id) {
    if (blocked() || !spots[id]) return;
    clearInput(); setOpen(false);
    target = { ...spots[id], id };
    destination.style.left = target.x / 16 + '%';
    destination.style.top = target.y / 9 + '%';
    destination.hidden = false;
    frame.focus({ preventScroll: true });
  }
  function step(dt) {
    if (blocked()) return false;
    let dx = 0, dy = 0;
    for (const key of keys) { const d = directions[key]; if (d) { dx += d[0]; dy += d[1]; } }
    if (dx || dy) cancelTravel();
    else if (target) {
      dx = target.x - position.x; dy = target.y - position.y;
      if (Math.hypot(dx, dy) < 6) {
        position = { x: target.x, y: target.y };
        const id = target.id; cancelTravel(); interact(id); persistSoon(); return false;
      }
    }
    const length = Math.hypot(dx, dy);
    if (!length) return false;
    if (open) setOpen(false);
    const speed = 385, travel = target ? Math.min(speed * dt, length) : speed * dt;
    const next = constrain({ x: position.x + dx / length * travel, y: position.y + dy / length * travel });
    const moved = Math.hypot(next.x - position.x, next.y - position.y) > .01;
    if (dx) face = dx < 0 ? -1 : 1;
    position = next;
    if (moved) walkTime += dt;
    return moved;
  }
  function tick(time) {
    if (stopped) return;
    accumulator += Math.min((time - lastTime) / 1000, .1); lastTime = time;
    let moving = false;
    while (accumulator >= 1 / 60) { moving = step(1 / 60) || moving; accumulator -= 1 / 60; }
    draw(moving);
    requestAnimationFrame(tick);
  }

  document.addEventListener('keydown', event => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (directions[event.code] && !blocked()) {
      event.preventDefault(); keys.add(event.code); cancelTravel();
    }
    if (event.code === 'KeyE' && !event.repeat && !blocked()) { event.preventDefault(); interact(); }
    if (event.code === 'Escape' && !modalElement.open) {
      clearInput(); cancelTravel(); wardrobe.hidden = true; setOpen(false); frame.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keyup', event => {
    if (directions[event.code]) { keys.delete(event.code); persistSoon(); }
  });
  window.addEventListener('blur', () => { clearInput(); cancelTravel(); persistSoon(); });
  document.addEventListener('visibilitychange', () => { clearInput(); lastTime = performance.now(); accumulator = 0; persistSoon(); });
  // A click destination is cancelled if a modal or wardrobe opens; no delayed
  // interaction can run behind another conversation.
  new MutationObserver(() => {
    if (modalElement.open) { clearInput(); cancelTravel(); }
    else frame.focus({ preventScroll: true });
    updatePrompt();
  }).observe(modalElement, { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || button.dataset.action === 'help') return;
    const spot = spots[state.place];
    if (!open || !spot || Math.hypot(position.x - spot.x, position.y - spot.y) > spot.radius) {
      event.stopImmediatePropagation(); event.preventDefault(); say('走近对应地点后，按 E 开始交互。');
    }
  }, true);
  document.addEventListener('scene:navigate', event => navigate(event.detail));
  document.addEventListener('scene:render', () => { updatePrompt(); });
  document.addEventListener('scene:reset', () => {
    clearInput(); cancelTravel(); readPosition(); wardrobe.hidden = true; setOpen(true); draw(false);
  });
  document.querySelector('#dialogue-close').onclick = () => { setOpen(false); frame.focus({ preventScroll: true }); updatePrompt(); };
  prompt.onclick = () => interact();
  function closeWardrobe() { wardrobe.hidden = true; frame.focus({ preventScroll: true }); updatePrompt(); }
  document.querySelector('#wardrobe-btn').onclick = () => {
    clearInput(); cancelTravel(); wardrobe.hidden = !wardrobe.hidden; updatePrompt();
  };
  document.querySelector('#wardrobe-close').onclick = closeWardrobe;
  document.querySelector('#quest-toggle').onclick = event => {
    const panel = document.querySelector('#quest-panel'); panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  };
  document.querySelector('#journal-btn').onclick = () => {
    const content = document.createElement('div'); content.className = 'journal-entries';
    for (const item of state.logs) {
      const row = document.createElement('div'); row.className = 'journal-entry';
      const date = document.createElement('small'); date.textContent = '第 ' + item.day + ' 日';
      const text = document.createElement('p'); text.textContent = item.text; row.append(date, text); content.append(row);
    }
    modal('<button class="dialog-close" data-modal="close" aria-label="关闭">×</button><div class="modal-kicker">旧事散落，落笔成章</div><h2 id="modal-title">梨园手记</h2>');
    document.querySelector('#modal-content').append(content);
  };
  document.querySelector('#settings-btn').onclick = () => {
    modal('<button class="dialog-close" data-modal="close" aria-label="关闭">×</button><div class="modal-kicker">操作与玩法</div><h2 id="modal-title">走进这场戏。</h2><p>WASD 或方向键：在庭院内自由走动。\nE：与附近的地点或人物交互。\n鼠标点击地点标签：自动走近并展开选项。\nEsc：收起对话或衣箱。\n\n走动不消耗行动；练习、帮工和登台才会消耗。三日内备齐 120 文、3 级才艺、朱砂戏服，并留 2 点行动登台。\n\n节奏小课为按键玩法，尚未接入 AI 唱歌评分。</p><div class="settings-actions"><button id="settings-intro">重看序幕</button><button id="settings-help">完整玩法提示</button><button id="settings-reset">重开本次行程</button></div>');
    document.querySelector('#settings-intro').onclick = intro;
    document.querySelector('#settings-help').onclick = help;
    document.querySelector('#settings-reset').onclick = () => document.querySelector('#reset-btn').click();
  };
  document.querySelector('#fullscreen-btn').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch { say('当前浏览器未开放全屏。可以使用浏览器的全屏功能。'); }
  };
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      frame.style.width = 'min(100vw, calc(100vh * 16 / 9))';
      frame.style.height = 'min(100vh, calc(100vw * 9 / 16))';
      frame.style.margin = 'auto';
    } else { frame.style.width = ''; frame.style.height = ''; frame.style.margin = ''; }
  });
  document.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (blocked()) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      cancelTravel(); keys.add(button.dataset.move);
    });
    const release = () => { keys.delete(button.dataset.move); persistSoon(); };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  frame.addEventListener('pointerdown', event => {
    if (!event.target.closest('button, .quest-panel, .wardrobe-panel, .dialogue-panel')) frame.focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', () => { clearInput(); state.player = { ...position }; save(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; lastTime = performance.now(); } });
  readPosition();
  // Existing saves keep their story and outfit. Open a menu only when its
  // saved location is still within reach of the saved feet position.
  open = nearestSpot() === state.place;
  setOpen(open); draw(false); requestAnimationFrame(tick);
})();
