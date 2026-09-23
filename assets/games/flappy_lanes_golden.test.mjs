// Golden drift-check for the flappy + lanes ES-module ports.
//
// Run with plain node (zero deps):
//   node assets/games/flappy_lanes_golden.test.mjs
//
// Loads the committed katgpt-rs oracle fixtures, reconstructs each state
// from the fixture's structured fields, re-renders every sentence /
// feature row / label / question through the JS ports, and asserts
// byte-equality on every one. Also proves the fastrand 2.4.1 RNG port by
// re-running both enumerators at the fixture seed (607, n=100) and
// requiring the exact fixture state sequence back.
//
// Fixture location: the site clone lives INSIDE the katgpt-rs checkout at
// .raw/reflex-site/, so the fixtures are four levels up:
//   ../../../../tests/fixtures/*.jsonl   (relative to this file)
// Override with FLAPPY_FIXTURE / LANES_FIXTURE env vars if the tree moves.

import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as flappy from './flappy.js';
import * as lanes from './lanes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FLAPPY_FIXTURE = process.env.FLAPPY_FIXTURE
  ?? path.resolve(here, '../../../../tests/fixtures/flappy_oracle_laya_en_v3.jsonl');
const LANES_FIXTURE = process.env.LANES_FIXTURE
  ?? path.resolve(here, '../../../../tests/fixtures/lanes_oracle_laya_en_v1.jsonl');

/** Parse a fixture JSONL, skipping the first-line `_meta` provenance
 * record. */
function loadStates(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
    .filter((rec) => rec.state_id !== '_meta');
}

const flappyRecords = loadStates(FLAPPY_FIXTURE);
const lanesRecords = loadStates(LANES_FIXTURE);

// Reconstruction notes: each fixture record carries the full seed state in
// `state`, so no derivation is needed. Flappy states are {y, v, g, h};
// lanes states are {lanes: [{kind, dist} × 3]}. `p_clean` / `argmax` are
// oracle outputs — NOT part of the render contract — and are ignored here.
function flappyStateOf(rec) {
  return { y: rec.state.y, v: rec.state.v, g: rec.state.g, h: rec.state.h };
}

function lanesStateOf(rec) {
  return { lanes: rec.state.lanes.map((l) => ({ kind: l.kind, dist: l.dist })) };
}

const tally = {
  flappy: { states: flappyRecords.length, stateOk: 0, questionOk: 0, grammarOk: 0, options: 0, labelOk: 0, sentenceOk: 0, featuresOk: 0 },
  lanes: { states: lanesRecords.length, stateOk: 0, questionOk: 0, grammarOk: 0, options: 0, labelOk: 0, sentenceOk: 0, featuresOk: 0 },
};

test('flappy fixture: grammar + question pinned', () => {
  assert.ok(flappyRecords.length > 0, 'flappy fixture is empty');
  for (const rec of flappyRecords) {
    assert.equal(rec.grammar, flappy.GRAMMAR_ID, `${rec.state_id}: grammar id`);
    assert.equal(rec.question, flappy.QUESTION, `${rec.state_id}: question text`);
    tally.flappy.grammarOk += 1;
    tally.flappy.questionOk += 1;
  }
});

test('flappy fixture: every sentence + feature row byte-identical', () => {
  for (const rec of flappyRecords) {
    const s = flappyStateOf(rec);
    assert.equal(
      flappy.renderStateSentence(s),
      rec.state_sentence,
      `${rec.state_id}: state sentence`,
    );
    tally.flappy.stateOk += 1;

    assert.equal(rec.options.length, 2, `${rec.state_id}: option count`);
    rec.options.forEach((opt, i) => {
      tally.flappy.options += 1;
      const action = flappy.ACTIONS[i];
      assert.equal(opt.label, action, `${rec.state_id}: option ${i} label (pinned order)`);
      tally.flappy.labelOk += 1;
      assert.equal(
        flappy.renderOptionSentence(s, action),
        opt.sentence,
        `${rec.state_id}: option ${i} (${action}) sentence`,
      );
      tally.flappy.sentenceOk += 1;
      assert.deepEqual(
        flappy.featureRow(s, action),
        opt.features,
        `${rec.state_id}: option ${i} (${action}) features`,
      );
      tally.flappy.featuresOk += 1;
    });

    // The v2 corpus law: the two option sentences of one state always
    // differ (same-band states are excluded at the enumerator).
    assert.notEqual(rec.options[0].sentence, rec.options[1].sentence, `${rec.state_id}: v2 options coincide`);
  }
});

test('lanes fixture: grammar + question pinned', () => {
  assert.ok(lanesRecords.length > 0, 'lanes fixture is empty');
  for (const rec of lanesRecords) {
    assert.equal(rec.grammar, lanes.GRAMMAR_ID, `${rec.state_id}: grammar id`);
    assert.equal(rec.question, lanes.QUESTION, `${rec.state_id}: question text`);
    tally.lanes.grammarOk += 1;
    tally.lanes.questionOk += 1;
  }
});

test('lanes fixture: every sentence + feature row byte-identical', () => {
  for (const rec of lanesRecords) {
    const s = lanesStateOf(rec);
    assert.equal(
      lanes.renderStateSentence(s),
      rec.state_sentence,
      `${rec.state_id}: state sentence`,
    );
    tally.lanes.stateOk += 1;

    assert.equal(rec.options.length, 3, `${rec.state_id}: option count`);
    rec.options.forEach((opt, i) => {
      tally.lanes.options += 1;
      assert.equal(opt.label, lanes.OPTION_LABELS[i], `${rec.state_id}: option ${i} label (pinned order)`);
      tally.lanes.labelOk += 1;
      assert.equal(
        lanes.renderOptionSentence(s, i),
        opt.sentence,
        `${rec.state_id}: option ${i} sentence`,
      );
      tally.lanes.sentenceOk += 1;
      assert.deepEqual(
        lanes.featureRow(s, i),
        opt.features,
        `${rec.state_id}: option ${i} features`,
      );
      tally.lanes.featuresOk += 1;
    });
  }
});

test('flappy: enumerateStates(607, 100) reproduces the fixture states exactly', () => {
  const states = flappy.enumerateStates(607, 100);
  assert.equal(states.length, 100);
  states.forEach((rec, i) => {
    const fixture = flappyRecords[i];
    assert.equal(rec.stateId, fixture.state_id, `state ${i}: id`);
    assert.deepEqual(
      rec.state,
      flappyStateOf(fixture),
      `state ${i}: RNG-stream parity with the fixture`,
    );
  });
});

test('lanes: enumerateStates(607, 100) reproduces the fixture states exactly', () => {
  const states = lanes.enumerateStates(607, 100);
  assert.equal(states.length, 100);
  states.forEach((rec, i) => {
    const fixture = lanesRecords[i];
    assert.equal(rec.stateId, fixture.state_id, `state ${i}: id`);
    assert.deepEqual(
      rec.state,
      lanesStateOf(fixture),
      `state ${i}: RNG-stream parity with the fixture`,
    );
  });
});

test('both games: renderStateSentence leaks no digits (closed grammar law)', () => {
  const noDigits = (str) => !/\d/.test(str);
  for (const rec of flappyRecords) {
    assert.ok(noDigits(rec.state_sentence));
    for (const opt of rec.options) assert.ok(noDigits(opt.sentence));
  }
  for (const rec of lanesRecords) {
    assert.ok(noDigits(rec.state_sentence));
    for (const opt of rec.options) assert.ok(noDigits(opt.sentence));
  }
});

after(() => {
  const f = tally.flappy;
  const l = tally.lanes;
  console.log(`flappy: ${f.stateOk}/${f.states} sentences byte-identical; lanes: ${l.stateOk}/${l.states}`);
  console.log(
    `  flappy detail: state ${f.stateOk}/${f.states}, question ${f.questionOk}/${f.states}, `
    + `grammar ${f.grammarOk}/${f.states}, labels ${f.labelOk}/${f.options}, `
    + `option sentences ${f.sentenceOk}/${f.options}, features ${f.featuresOk}/${f.options}`,
  );
  console.log(
    `  lanes detail:  state ${l.stateOk}/${l.states}, question ${l.questionOk}/${l.states}, `
    + `grammar ${l.grammarOk}/${l.states}, labels ${l.labelOk}/${l.options}, `
    + `option sentences ${l.sentenceOk}/${l.options}, features ${l.featuresOk}/${l.options}`,
  );
  console.log('  enumerate parity: flappy 100/100, lanes 100/100 (seed 607 vs fixture states)');
  const ok = f.stateOk === f.states && l.stateOk === l.states
    && f.sentenceOk === f.options && l.sentenceOk === l.options
    && f.featuresOk === f.options && l.featuresOk === l.options
    && f.labelOk === f.options && l.labelOk === l.options
    && f.questionOk === f.states && l.questionOk === l.states;
  if (!ok) process.exitCode = 1;
});
