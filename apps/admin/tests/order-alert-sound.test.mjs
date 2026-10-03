import assert from "node:assert/strict";
import test from "node:test";
import { createOrderAlertSound } from "../src/features/new-order-alert/lib/order-alert-sound.ts";

function fakeAudio(state = "running") {
  const tones = [];
  const context = {
    state,
    currentTime: 10,
    destination: {},
    onstatechange: null,
    closes: 0,
    async resume() { this.state = "running"; },
    async close() { this.state = "closed"; this.closes++; },
    createOscillator() {
      const tone = {
        frequency: { value: 0 },
        connect() {},
        disconnect() { this.disconnected = true; },
        start(time) { this.startTime = time; },
        stop(time) { this.stopTime = time; },
      };
      tones.push(tone);
      return tone;
    },
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
    },
  };
  return { context, tones };
}

test("audio unlock is quiet, a new batch rings once, and contexts are reused and closed", async () => {
  const { context, tones } = fakeAudio("suspended");
  let created = 0;
  const states = [];
  const sound = createOrderAlertSound(state => states.push(state), () => { created++; return context; });
  assert.equal(sound.play(), false);
  await sound.enable();
  assert.equal(tones.length, 0);
  assert.equal(sound.isReady(), true);
  assert.equal(sound.play(), true);
  assert.equal(tones.length, 2);
  assert(tones.every(tone => tone.stopTime > tone.startTime && tone.stopTime - tone.startTime < 1));
  for (const tone of tones) { tone.onended(); assert.equal(tone.disconnected, true); }
  await sound.enable(true);
  assert.equal(tones.length, 4);
  assert.equal(created, 1);
  sound.stop();
  assert.equal(context.closes, 1);
  assert.equal(sound.play(), false);
  assert.equal(states.at(-1), "inactive");
  sound.dispose();
});

test("unsupported or blocked audio never throws or schedules delayed tones", async () => {
  const states = [];
  const unsupported = createOrderAlertSound(state => states.push(state), () => null);
  await unsupported.enable(true);
  assert.equal(states.at(-1), "unsupported");
  assert.equal(unsupported.play(), false);
  const { context, tones } = fakeAudio("suspended");
  context.resume = async () => { throw new Error("autoplay denied"); };
  const sound = createOrderAlertSound(state => states.push(state), () => context);
  await sound.enable(true);
  assert.equal(states.at(-1), "blocked");
  assert.equal(sound.play(), false);
  assert.equal(tones.length, 0);
  sound.dispose();
});

test("muting or logout during resume cancels the preview and releases audio", async () => {
  for (const action of ["stop", "dispose"]) {
    const { context, tones } = fakeAudio("suspended");
    let resume;
    context.resume = () => new Promise(resolve => { resume = resolve; });
    const states = [];
    const sound = createOrderAlertSound(state => states.push(state), () => context);
    const pending = sound.enable(true);
    sound[action]();
    const count = states.length;
    context.state = "running";
    resume();
    await pending;
    assert.equal(tones.length, 0);
    assert.equal(context.closes, 1);
    assert.equal(states.length, count);
  }
});

test("an interrupted audio context stops ringing and recovers on a new gesture", async () => {
  const { context, tones } = fakeAudio();
  const states = [];
  const sound = createOrderAlertSound(state => states.push(state), () => context);
  await sound.enable();
  context.state = "interrupted";
  context.onstatechange();
  assert.equal(states.at(-1), "blocked");
  assert.equal(sound.play(), false);
  await sound.enable(true);
  assert.equal(tones.length, 2);
  sound.dispose();
});
