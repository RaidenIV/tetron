# Pause System

Portable reference for recreating the Capsule Havoc pause system in another game project.

The system uses a single game-state flag, a render-loop gate, input routing, audio pause/resume hooks, and a modal-style pause overlay. The goal is to freeze gameplay simulation while keeping the current frame visible and the pause menu interactive.

---

## 1. Core Design

### Purpose

The pause system should:

- Stop world simulation.
- Stop player movement and combat input.
- Stop enemy AI, projectiles, spawners, timers, pickups, and damage logic.
- Keep rendering the current scene frame so the game does not visually disappear.
- Show a pause overlay/menu.
- Pause background music without fully stopping the music state.
- Allow pause-menu buttons, sliders, settings, and navigation to remain usable.
- Resume cleanly without a large physics/time jump.

### Main State Flags

```js
const state = {
  paused: false,
  gameOver: false,
  upgradeOpen: false,
  panelOpen: false,
  keys: {
    w: false,
    a: false,
    s: false,
    d: false,
  },
};
```

Use `paused` as the primary pause flag. Keep other blocking states separate:

```js
const shouldFreezeGameplay =
  state.paused ||
  state.gameOver ||
  state.upgradeOpen;
```

This lets pause, game-over, and upgrade/shop screens freeze gameplay for different reasons without all pretending to be the same state.

---

## 2. Pause Behavior

### Toggle Rules

Pause can be toggled from:

- `Escape` key.
- A Pause/Resume button in the control panel.
- A Resume button inside the pause overlay.

Recommended behavior:

```js
function togglePause() {
  state.paused = !state.paused;

  setPauseOverlayVisible(state.paused);
  setBodyPausedClass(state.paused);

  if (state.paused) {
    pauseMusic();
  } else {
    resetFrameClock();
    resumeMusic();
    syncPauseMenuFromGameState();
  }

  updatePauseButtonLabel();
  clearMovementKeys();
}
```

### Why Clear Movement Keys

When the user pauses while holding `W`, `A`, `S`, or `D`, the browser may not fire a matching `keyup` event while focus is inside the pause menu. Clear movement keys when pausing or unpausing so the player does not keep moving after resume.

```js
function clearMovementKeys() {
  state.keys.w = false;
  state.keys.a = false;
  state.keys.s = false;
  state.keys.d = false;
}
```

### Dev Panel Rule

In Capsule Havoc, opening the control panel does **not** pause the game. If the user presses `Escape` while the control panel is open, the panel closes first, then the pause menu opens.

```js
function onEscapePressed() {
  if (state.gameOver) return;

  if (state.panelOpen) {
    togglePanel();
  }

  togglePause();
}
```

This prevents the dev/control panel and pause overlay from competing for focus.

---

## 3. Render Loop Gate

### Core Pattern

The animation loop should keep running, but gameplay updates should stop while paused.

```js
function tick() {
  requestAnimationFrame(tick);

  if (state.paused || state.gameOver || state.upgradeOpen) {
    renderSceneFrame();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  updatePlayer(delta);
  updateEnemies(delta);
  updateProjectiles(delta);
  updatePickups(delta);
  updateParticles(delta);
  updateHud(delta);

  renderSceneFrame();
}
```

### Important Detail: Still Render While Paused

Do **not** stop `requestAnimationFrame`. Rendering while paused keeps:

- The frozen game scene visible behind the overlay.
- CSS2D/HTML labels aligned if your renderer uses DOM overlays.
- Pause-menu visual effects responsive.
- Window resize behavior stable.

### Important Detail: Reset Clock on Resume

If the game is paused for 60 seconds, `clock.getDelta()` may return a huge value on the first frame after resume. Reset the clock when unpausing.

```js
function resumeFromPause() {
  resetFrameClock(); // usually clock.getDelta() once, or clock.start()
  state.paused = false;
}
```

In Three.js, the simple pattern is:

```js
clock.getDelta();
```

right before resuming gameplay updates.

---

## 4. Input Design

### Keyboard Routing

Pause controls should be handled **before** the paused-input guard. Gameplay controls should be ignored when paused.

```js
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    onEscapePressed();
    return;
  }

  if (event.key.toLowerCase() === 'm') {
    toggleMute();
    return;
  }

  if (state.paused) return;

  handleAbilityInput(event);
  handleMovementInput(event);
  handleDashInput(event);
});
```

### Recommended Allowed Inputs While Paused

Allow:

- `Escape` to resume/pause.
- Mouse clicks on pause-menu UI.
- Audio settings sliders/buttons.
- Visual settings controls.
- Quit/restart buttons.
- Mute toggle, if desired.

Block:

- Movement.
- Shooting.
- Dash.
- Ability activation.
- Enemy/admin gameplay controls unless intentionally allowed.

---

## 5. Pause Overlay UI

### UI Structure

Use one full-screen overlay with internal pages.

```html
<div id="pause-overlay">
  <div class="pause-menu">
    <div class="pause-menu-hdr">
      <div id="pause-menu-title">PAUSED</div>
    </div>

    <div class="pause-menu-body">
      <div id="pause-page-main" class="pause-page active">
        <button id="pause-resume-btn">RESUME</button>
        <button id="pause-restart-btn">RESTART</button>
        <button id="pause-settings-btn">SETTINGS</button>
        <button id="pause-quit-btn">QUIT TO MENU</button>
      </div>

      <div id="pause-page-settings" class="pause-page">
        <button id="pause-audio-btn">AUDIO</button>
        <button id="pause-visuals-btn">VISUALS</button>
        <button id="pause-back-btn">BACK</button>
      </div>
    </div>
  </div>
</div>
```

### Overlay Visibility

```js
function setPauseOverlayVisible(isVisible) {
  document
    .getElementById('pause-overlay')
    ?.classList.toggle('show', isVisible);
}

function setBodyPausedClass(isPaused) {
  document.body.classList.toggle('is-paused', isPaused);
}
```

### Page Navigation

```js
function showPausePage(name) {
  setPageActive('pause-page-main', name === 'main');
  setPageActive('pause-page-settings', name === 'settings');
  setPageActive('pause-page-audio', name === 'audio');
  setPageActive('pause-page-visuals', name === 'visuals');

  const title = document.getElementById('pause-menu-title');
  if (title) title.textContent = name.toUpperCase();
  if (name === 'main' && title) title.textContent = 'PAUSED';
}

function setPageActive(id, active) {
  document.getElementById(id)?.classList.toggle('active', active);
}
```

Always return to the main pause page when opening the pause menu.

---

## 6. Audio Behavior

### Music Pause vs Music Stop

Pausing should suspend music playback but preserve the intent to keep music active after resume.

```js
function pauseMusic() {
  musicElement.pause();
  // Keep musicWanted = true.
}

function resumeMusic() {
  if (musicWanted && !muted) {
    musicElement.play();
  }
}
```

Do not call the full `stopMusic()` function for pause unless you want the track to restart from the beginning later.

### SFX While Paused

Pause-menu hover/click sounds can still play while paused. Gameplay SFX should stop naturally because gameplay update logic is frozen.

Recommended split:

```js
if (state.paused) {
  allowMenuSfxOnly();
}
```

---

## 7. Restart and Quit Behavior

### Restart From Pause

When restarting from the pause menu:

```js
function restartFromPause() {
  restartGame();

  state.paused = false;
  setPauseOverlayVisible(false);
  setBodyPausedClass(false);
  updatePauseButtonLabel();
}
```

The restart function should clear all active gameplay entities, timers, input flags, bullets, enemies, pickups, and temporary effects.

### Quit to Menu

Quit should:

- Hide the pause overlay.
- Remove paused body class.
- Set gameplay mode back to menu.
- Stop or replace game music with menu music.
- Clear active gameplay input.

```js
function quitToMenu() {
  state.paused = false;
  setPauseOverlayVisible(false);
  setBodyPausedClass(false);
  clearMovementKeys();
  showMainMenu();
}
```

---

## 8. Styling Notes

### Overlay Visual Style

Recommended style:

- Fixed full-screen overlay.
- Dark translucent backdrop.
- Centered modal/menu card.
- Slight scale-in animation when shown.
- High z-index above HUD, canvas, and control panel.
- Disable pointer events while hidden and enable them while visible.

```css
#pause-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.58);
  opacity: 0;
  pointer-events: none;
  z-index: 1000;
}

#pause-overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.pause-menu {
  transform: scale(0.96);
  opacity: 0;
}

#pause-overlay.show .pause-menu {
  transform: scale(1);
  opacity: 1;
}
```

---

## 9. Portable Pause Config

```js
const PAUSE_CONFIG = {
  key: 'Escape',
  clearMovementOnToggle: true,
  keepRenderingWhilePaused: true,
  pauseMusic: true,
  allowMenuSfx: true,
  resetClockOnResume: true,
  closeControlPanelBeforePause: true,
};
```

---

## 10. Porting Checklist

- [ ] Add `state.paused` to the central game state.
- [ ] Add a pause overlay container to HTML or UI scene graph.
- [ ] Add a Pause/Resume button.
- [ ] Add an `Escape` key listener before gameplay input handling.
- [ ] Ignore gameplay controls when `state.paused` is true.
- [ ] Keep `requestAnimationFrame` running while paused.
- [ ] Gate gameplay updates behind `if (state.paused) return` or equivalent.
- [ ] Render the frozen scene while paused.
- [ ] Reset frame clock when resuming.
- [ ] Pause/resume music instead of stopping/restarting it.
- [ ] Clear movement keys on pause/resume.
- [ ] Hide the pause overlay on restart and quit.
- [ ] Prevent pause overlay from conflicting with game-over, upgrade, countdown, or dev-panel UI.

---

## 11. Reusable Pseudocode

```js
const state = {
  paused: false,
  gameOver: false,
  upgradeOpen: false,
  keys: { w: false, a: false, s: false, d: false },
};

function tick() {
  requestAnimationFrame(tick);

  if (state.paused || state.gameOver || state.upgradeOpen) {
    renderSceneFrame();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  updateGameplay(delta);
  renderSceneFrame();
}

function togglePause() {
  if (state.gameOver) return;

  state.paused = !state.paused;
  showPauseOverlay(state.paused);
  document.body.classList.toggle('is-paused', state.paused);

  if (state.paused) {
    pauseMusic();
  } else {
    clock.getDelta();
    resumeMusic();
    showPausePage('main');
  }

  clearMovementKeys();
  updatePauseButton();
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    togglePause();
    return;
  }

  if (state.paused) return;

  handleMovement(event);
  handleCombat(event);
  handleAbilities(event);
}

function clearMovementKeys() {
  state.keys.w = false;
  state.keys.a = false;
  state.keys.s = false;
  state.keys.d = false;
}
```
