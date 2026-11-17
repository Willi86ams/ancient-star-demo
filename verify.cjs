const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  for (const file of ['game.js', 'scene.js']) new Function(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const out = path.join(__dirname, '..', 'output', 'playwright');
  fs.mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1460, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = selector => page.locator(selector).click();
  const place = async id => {
    await click(`[data-place="${id}"]`);
    await page.waitForFunction(id => state.place === id && document.querySelector('#dialogue-panel').classList.contains('is-open'), id, { timeout: 12000 });
  };
  const act = id => click(`[data-action="${id}"]`);
  const val = id => page.locator('#' + id).textContent();
  const screenshot = async name => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.waitForTimeout(350);
      try { await page.screenshot({ path: path.join(out, name), fullPage: true }); return; }
      catch (error) { if (attempt === 2) throw error; }
    }
  };
  const reset = async () => { await click('#settings-btn'); await click('#settings-reset'); await click('[data-modal="restart"]'); };
  const route = async withClue => {
    await place('tea'); await act('work'); await act('work');
    await place('troupe'); await act('practice');
    if (withClue) { await place('tea'); await act('clue'); await click('[data-modal="close"]'); }
    await click('#daily-btn'); await click('#rest-btn');
    await place('troupe'); await act('practice'); await click('#daily-btn');
    await click('#wardrobe-btn'); await click('[data-outfit="opera"]'); await click('#wardrobe-close');
    await place('tea'); await act('work');
    assert.equal(await val('money'), '140');
    assert.equal(await val('ap'), '2');
    assert.equal(await val('talent'), '3');
    await place('stage'); await act('enter'); await click('[data-modal="confirm-enter"]');
  };
  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    assert.equal(await page.locator('.scene-background').evaluate(img => img.complete && img.naturalWidth > 1000), true, 'Generated background must load offline');
    const rect = await page.locator('#game').boundingBox();
    assert.ok(Math.abs(rect.width / rect.height - 16 / 9) < .01, 'Scene must remain 16:9');
    await page.keyboard.press('Escape');
    const start = await page.evaluate(() => ({ ...state.player, ap: state.ap }));
    await page.keyboard.down('KeyD');
    await page.waitForFunction(x => state.player.x > x + 180, start.x, { timeout: 5000 });
    await page.keyboard.up('KeyD');
    const moved = await page.evaluate(() => ({ ...state.player, ap: state.ap }));
    assert.ok(moved.x > start.x + 70, 'D must move the player to the right');
    assert.equal(moved.ap, start.ap, 'Walking costs no action points');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
    assert.ok(await page.evaluate(() => state.player.y >= 590), 'Player cannot walk through the rear scenery');
    await page.keyboard.press('KeyE');
    assert.equal(await page.locator('#dialogue-panel').evaluate(el => el.classList.contains('is-open')), true, 'E must open a nearby conversation');
    await act('rhythm');
    const paused = await page.evaluate(() => state.player.x);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(250); await page.keyboard.up('KeyD');
    assert.equal(await page.evaluate(() => state.player.x), paused, 'Movement must pause behind modal dialogs');
    await click('[data-modal="close"]');
    await page.keyboard.press('Escape');
    await page.keyboard.down('KeyA'); await page.waitForTimeout(1600); await page.keyboard.up('KeyA');
    assert.ok(await page.evaluate(() => state.player.x >= 65), 'Left boundary collision must hold');
    await page.waitForTimeout(300);
    const savedPosition = await page.evaluate(() => ({ ...state.player }));
    await page.reload();
    assert.ok(await page.evaluate(p => Math.abs(state.player.x - p.x) < 1 && Math.abs(state.player.y - p.y) < 1, savedPosition), 'Player location must survive reload');
    await reset();
    await screenshot('ancient-star-desktop.png');
    assert.equal(await val('ap'), '4');
    await place('stage'); await act('enter');
    assert.equal(await page.locator('dialog').isVisible(), false, 'Entry requirements must be enforced');
    await reset(); await route(true);
    await page.reload(); assert.equal(await val('ap'), '0', 'Reload resumes puzzle without charging twice');
    await click('[data-ending="true"]');
    assert.match(await val('modal-title'), /隐藏结局/);
    assert.equal(await val('money'), '100', 'Reward and rent settle exactly once');
    await click('[data-modal="restart"]'); assert.equal(await val('archive-count'), '1');
    await route(false);
    assert.equal(await page.locator('[data-ending="true"]').count(), 0, 'Hidden choice requires clue');
    await click('[data-ending="normal"]'); assert.match(await val('modal-title'), /普通结局/);
    await click('[data-modal="restart"]'); await route(false); await click('[data-ending="wrong"]');
    assert.match(await val('modal-title'), /这句不在本上/);
    await click('[data-modal="restart"]');
    await click('#rest-btn'); await click('#rest-btn'); await click('#rest-btn');
    assert.match(await val('modal-title'), /灯尽人散/);
    await click('[data-modal="restart"]');
    await place('tea'); await act('work'); await act('work'); await act('work');
    await click('#rest-btn'); await click('#rest-btn'); await click('#rest-btn');
    assert.match(await val('modal-title'), /误了这场戏/);
    assert.equal(await val('archive-count'), '5');
    await click('[data-modal="restart"]');
    await place('troupe'); await act('rhythm'); await click('[data-modal="start-rhythm"]');
    assert.equal(await val('ap'), '3');
    await click('[data-modal="close"]'); assert.equal(await val('ap'), '4', 'Cancelled lesson refunds action');
    await act('rhythm'); await click('[data-modal="start-rhythm"]');
    // Schedule the DOM key events against the same monotonic clock, avoiding
    // cross-process automation latency when verifying all eight judgements.
    await page.evaluate(() => {
      for (const note of rhythm.notes) {
        setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: note.key, bubbles: true })),
          Math.max(0, note.time - (performance.now() - rhythm.start)));
      }
    });
    await page.waitForFunction(() => document.querySelector('#modal-title').textContent.includes('渐入佳境'));
    assert.match(await page.locator('#modal-content p').first().textContent(), /8 \/ 8/);
    assert.equal(await val('talent'), '3');
    await click('[data-modal="close"]'); await click('#daily-btn');
    assert.equal(await val('money'), '75');
    await page.reload(); assert.equal(await val('money'), '75'); assert.equal(await val('talent'), '3');
    assert.equal(await page.locator('#daily-btn').isDisabled(), true, 'Daily reward cannot be reclaimed');
    await reset(); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('ancient-star-mobile.png');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile must not overflow horizontally');
    await page.setViewportSize({ width: 1460, height: 1000 });
    await screenshot('ancient-star-desktop.png');
    assert.deepEqual(errors, []);
    console.log('PASS: 16:9 scene, offline artwork, WASD movement, boundary collision, E interaction, click-to-walk, modal pause, position save, all 5 endings, exact settlement, rhythm 8/8, cancellation refund, daily reward, mobile layout, no runtime errors.');
    console.log('Screenshots: ' + out);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
