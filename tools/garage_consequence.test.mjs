import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { CONVERSATIONS, EPILOGUE_BEATS } from '../src/content/story.js';
import { DialogueRunner } from '../src/game/narrative.js';
import { Director } from '../src/game/director.js';
import { GameState, SAVE_KEY } from '../src/game/state.js';
import { setLocale, t } from '../src/content/i18n.js';

// CPU story contracts: real dialogue choices and ending resolution, with
// rendering/fades and browser storage replaced at their boundaries. The Nessa
// node slice and final intention are fixtures, not a complete played route.
test('garage choices produce one coherent family outcome, including after save/load', async (context) => {
  const oldStorage = globalThis.localStorage;
  const slots = new Map();
  globalThis.localStorage = {
    getItem: key => slots.get(key) ?? null,
    setItem: (key, value) => slots.set(key, String(value)),
    removeItem: key => slots.delete(key),
  };
  context.after(() => {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
    setLocale('en');
  });
  const records = [];
  const passages = new Map(EPILOGUE_BEATS.flatMap(b => [b, ...(b.variants || [])])
    .map(p => [p.id, p.text]));
  const passage = id => t(`ep.${id}`, passages.get(id));
  assert.equal(EPILOGUE_BEATS.length, 8);
  for (const language of ['en', 'ja']) for (const gaveFilter of [false, true]) {
    for (const vent of ['leave', 'shut', 'half']) for (const final of ['publish', 'cut', 'deal', 'evacuate', 'leave']) {
      for (const restored of [false, true]) {
        setLocale(language);
        let state = new GameState();
        const runner = new DialogueRunner(state, { shutVents() {}, halfVents() {} });
        runner.start(CONVERSATIONS.garage);
        runner.advance();
        runner.choose(runner.choices().findIndex(c => c.goto === (gaveFilter ? 'g_filter' : 'g_air')));
        while (runner.active) runner.advance();
        assert.equal(state.countItem('filter'), gaveFilter ? 0 : 1);
        runner.start(CONVERSATIONS.vent_decision);
        runner.choose(runner.choices().findIndex(c => c.goto === `v_${vent}`));
        while (runner.active) runner.advance();
        runner.start({ id: 'nessa_truth', nodes: CONVERSATIONS.nessa_truth.nodes }, 'nt_shop');
        while (runner.active) runner.advance();
        state.record('final', final);
        if (restored) {
          const saved = state.serialise();
          state = new GameState();
          assert.equal(state.deserialise(saved), true);
        }
        let shown;
        const game = { player: null, setMode() {}, hud: { setVisible() {} }, emit() {},
          menus: { fadeOut: async () => {}, fadeIn: async () => {},
            showEnding: (ending, paragraphs) => { shown = { ending, paragraphs }; } } };
        await Director.prototype.finish.call({ game, state });
        const died = !gaveFilter && vent === 'leave';
        const familyId = died ? 'garage_died' : (!gaveFilter && vent === 'half' ? 'garage_lived_half' : 'garage_lived');
        const shopId = died ? 'nessa_shop_bereaved' : 'nessa_shop';
        const familyTexts = ['garage_died', 'garage_lived', 'garage_lived_half'].map(passage);
        assert.equal(shown.paragraphs.filter(p => familyTexts.includes(p)).length, 1);
        assert.ok(shown.paragraphs.includes(passage(familyId)), familyId);
        assert.ok(shown.paragraphs.includes(passage(shopId)), shopId);
        assert.ok(!shown.paragraphs.includes(passage(died ? 'nessa_shop' : 'nessa_shop_bereaved')));
        const persisted = JSON.parse(slots.get(SAVE_KEY));
        assert.equal(persisted.completed, true);
        assert.equal(persisted.state.ending, state.ending);
        assert.deepEqual(persisted.state.flags, [...state.flags]);
        records.push({ language, gaveFilter, vent, final, restored,
          ending: shown.ending.id, familyId, shopId, paragraphs: shown.paragraphs });
      }
    }
  }
  assert.equal(records.length, 120);
  if (process.env.GARAGE_EVIDENCE_OUT) {
    writeFileSync(process.env.GARAGE_EVIDENCE_OUT, JSON.stringify({
      scope: 'CPU actual dialogue/ending resolver and in-memory storage contracts; no rendering, full-route reachability, mobile measurement or blind comparison.',
      records,
    }, null, 2) + '\n');
  }
});
