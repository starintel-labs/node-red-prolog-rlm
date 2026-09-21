'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadModules, instantiate, driveInput, fixturePath, readCapture } = require('./helpers');

const RUNTIME_CFG = {
  id: 'rt1',
  swipl: fixturePath('fake-swipl'),
  rlmHome: '/opt/prolog-rlm',
  model: 'test-model',
  endpoint: 'http://127.0.0.1:8000/v1/chat/completions',
  credentialEnv: 'FAKE_SECRET_VALUE',
  maxTokens: 128,
  maxCost: '0.10',
  timeLimit: 30,
  contextBytes: 4096,
  hardTimeoutMs: 15000
};

function captureFile(t) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rlm-test-')), 'capture.json');
}

function runRlm(t, nodeConfig, msg, env, runtimeOverrides) {
  const cap = captureFile(t);
  const restore = { ...process.env };
  Object.assign(process.env, {
    FAKE_SECRET_VALUE: 'hunter2-hunter2',
    FAKE_SWIPL_CAPTURE: cap,
    FAKE_SWIPL_MODE: 'ok'
  }, env || {});
  const RED = loadModules('nodes/prolog-rlm-runtime.js', 'nodes/rlm.js');
  RED._nodesById.rt1 = Object.assign({}, RUNTIME_CFG, runtimeOverrides || {});
  const node = instantiate(RED, 'rlm', Object.assign({ runtime: 'rt1' }, nodeConfig));
  return driveInput(node, msg).then((result) => {
    for (const key of Object.keys(process.env)) {
      if (!(key in restore)) delete process.env[key];
    }
    for (const key of Object.keys(restore)) process.env[key] = restore[key];
    return { result, cap };
  });
}

test('rlm node builds the documented prolog-rlm argv without secrets', async () => {
  const { result, cap } = await runRlm(null, { query: 'what is in the context?', context: 'TOKEN_42' }, {});
  assert.strictEqual(result.err, undefined, 'unexpected error');
  assert.strictEqual(result.sent.length, 1);
  const envelope = result.sent[0].payload;
  assert.strictEqual(envelope.ok, true);
  const seen = readCapture(cap);
  const argv = seen.argv.join(' ');
  assert.match(argv, /-s \/opt\/prolog-rlm\/bin\/prolog-rlm\.pl -- rlm/);
  assert.match(argv, /rlm what is in the context\?/);
  assert.match(argv, /--context TOKEN_42/);
  assert.match(argv, /--json/);
  assert.match(argv, /--model test-model/);
  assert.match(argv, /--endpoint http:\/\/127\.0\.0\.1:8000\/v1\/chat\/completions/);
  assert.match(argv, /--credential-env FAKE_SECRET_VALUE/);
  assert.match(argv, /--max-tokens 128/);
  assert.match(argv, /--max-cost 0\.10/);
  assert.match(argv, /--time-limit 30/);
  assert.match(argv, /--context-bytes 4096/);
  // The credential value itself must never appear in argv.
  assert.ok(!seen.argv.includes('hunter2-hunter2'), 'secret leaked into argv');
  // ...but it does reach the subprocess through the environment.
  assert.strictEqual(seen.hasSecretEnv, true);
});

test('rlm node falls back to msg.payload for query and msg.context for context', async () => {
  const { result, cap } = await runRlm(null, {}, { payload: 'from payload', context: { k: 'v' } });
  assert.strictEqual(result.err, undefined);
  const argv = readCapture(cap).argv.join(' ');
  assert.match(argv, /rlm from payload/);
  assert.match(argv, /--context \{"k":"v"\}/);
});

test('rlm node surfaces non-zero exit as RLM_EXIT without sending', async () => {
  const { result } = await runRlm(null, { query: 'q' }, {}, { FAKE_SWIPL_MODE: 'fail' });
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'RLM_EXIT');
  assert.strictEqual(result.err.exitCode, 3);
  assert.match(result.err.message, /status 3/);
});

test('rlm node surfaces unparsable stdout as RLM_PARSE', async () => {
  const { result } = await runRlm(null, { query: 'q' }, {}, { FAKE_SWIPL_MODE: 'garbage' });
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'RLM_PARSE');
});

test('rlm node kills hung subprocesses as RLM_TIMEOUT', async () => {
  const { result } = await runRlm(null, { query: 'q' }, {}, { FAKE_SWIPL_MODE: 'sleep' }, { hardTimeoutMs: 250 });
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'RLM_TIMEOUT');
});

test('rlm node refuses to run without a runtime config', async () => {
  const RED = loadModules('nodes/prolog-rlm-runtime.js', 'nodes/rlm.js');
  const node = instantiate(RED, 'rlm', { runtime: 'missing' });
  const result = await driveInput(node, { payload: 'q' });
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'RLM_CONFIG');
});

test('rlm-direct node issues the direct command', async () => {
  const cap = captureFile(null);
  const restore = { ...process.env };
  Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
  const RED = loadModules('nodes/prolog-rlm-runtime.js', 'nodes/rlm-direct.js');
  RED._nodesById.rt1 = Object.assign({}, RUNTIME_CFG);
  const node = instantiate(RED, 'rlm-direct', { runtime: 'rt1', prompt: 'say hello' });
  const result = await driveInput(node, {});
  for (const key of Object.keys(restore)) process.env[key] = restore[key];
  delete process.env.FAKE_SWIPL_MODE;
  assert.strictEqual(result.err, undefined);
  const argv = readCapture(cap).argv.join(' ');
  assert.match(argv, /direct say hello --json/);
  assert.strictEqual(result.sent[0].payload.command, 'canned');
});

test('rlm-direct node falls back to msg.payload', async () => {
  const cap = captureFile(null);
  const restore = { ...process.env };
  Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
  const RED = loadModules('nodes/prolog-rlm-runtime.js', 'nodes/rlm-direct.js');
  RED._nodesById.rt1 = Object.assign({}, RUNTIME_CFG);
  const node = instantiate(RED, 'rlm-direct', { runtime: 'rt1' });
  const result = await driveInput(node, { payload: 'from payload' });
  for (const key of Object.keys(restore)) process.env[key] = restore[key];
  delete process.env.FAKE_SWIPL_MODE;
  assert.strictEqual(result.err, undefined);
  assert.match(readCapture(cap).argv.join(' '), /direct from payload/);
});

test('optional live lane: real prolog-rlm demo via RLM_E2E=1', { skip: process.env.RLM_E2E !== '1' }, async () => {
  const RED = loadModules('nodes/prolog-rlm-runtime.js');
  const helpers = require('../lib/prolog-rlm-subprocess');
  const cfg = {
    id: 'rt-real',
    swipl: 'swipl',
    rlmHome: process.env.RLM_HOME,
    hardTimeoutMs: 120000
  };
  await new Promise((resolve, reject) => {
    helpers.runPrologRlm(cfg, "demo", [], (err, envelope) => {
      if (err) return reject(err);
      assert.strictEqual(envelope.ok !== undefined || envelope !== undefined, true);
      resolve();
    });
  });
});

test('rlm node works when loaded alone on its own RED view (loader isolation regression)', async () => {
  const cap = captureFile(null);
  const restore = { ...process.env };
  Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
  const RED = loadModules('nodes/rlm.js');
  RED._nodesById.rt1 = Object.assign({}, RUNTIME_CFG);
  const node = instantiate(RED, 'rlm', { runtime: 'rt1', query: 'solo' });
  const result = await driveInput(node, {});
  for (const key of Object.keys(restore)) process.env[key] = restore[key];
  delete process.env.FAKE_SWIPL_MODE;
  delete process.env.FAKE_SWIPL_CAPTURE;
  assert.strictEqual(result.err, undefined, result.err && result.err.message);
  assert.match(readCapture(cap).argv.join(' '), /rlm solo/);
});

test('rlm-direct node works when loaded alone on its own RED view (loader isolation regression)', async () => {
  const cap = captureFile(null);
  const restore = { ...process.env };
  Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
  const RED = loadModules('nodes/rlm-direct.js');
  RED._nodesById.rt1 = Object.assign({}, RUNTIME_CFG);
  const node = instantiate(RED, 'rlm-direct', { runtime: 'rt1', prompt: 'solo' });
  const result = await driveInput(node, {});
  for (const key of Object.keys(restore)) process.env[key] = restore[key];
  delete process.env.FAKE_SWIPL_MODE;
  delete process.env.FAKE_SWIPL_CAPTURE;
  assert.strictEqual(result.err, undefined, result.err && result.err.message);
  assert.match(readCapture(cap).argv.join(' '), /direct solo/);
});

test('llm.starintel.actor provider preset resolves endpoint, credential env and model', async () => {
  const cap = captureFile(null);
  const restore = { ...process.env };
  Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
  const RED = loadModules('nodes/prolog-rlm-runtime.js', 'nodes/rlm.js');
  RED._nodesById.star = instantiate(RED, 'prolog-rlm-runtime', {
    id: 'star',
    swipl: fixturePath('fake-swipl'),
    rlmHome: '/opt/prolog-rlm',
    provider: 'llm.starintel.actor'
  });
  const node = instantiate(RED, 'rlm', { runtime: 'star', query: 'hi' });
  const result = await driveInput(node, {});
  for (const key of Object.keys(restore)) process.env[key] = restore[key];
  delete process.env.FAKE_SWIPL_MODE;
  delete process.env.FAKE_SWIPL_CAPTURE;
  assert.strictEqual(result.err, undefined, result.err && result.err.message);
  const argv = readCapture(cap).argv.join(' ');
  assert.match(argv, /--endpoint https:\/\/llm\.starintel\.actor\/v1\/chat\/completions/);
  assert.match(argv, /--credential-env STARINTEL_LLM_API_KEY/);
  assert.match(argv, /--model qwen3-8b/);
});
