module.exports = function (RED) {
  'use strict';

  function buildArgv(config, command, extras) {
    const script = joinPath(config.rlmHome, 'bin', 'prolog-rlm.pl');
    const argv = ['-q', '-s', script, '--', command];
    for (const extra of extras || []) {
      if (extra !== undefined && extra !== null && extra !== '') argv.push(String(extra));
    }
    argv.push('--json');
    if (config.model) argv.push('--model', String(config.model));
    if (config.endpoint) {
      argv.push('--endpoint', String(config.endpoint));
      if (config.noCredential) argv.push('--no-credential');
      else if (config.credentialEnv) argv.push('--credential-env', String(config.credentialEnv));
    }
    if (config.maxTokens) argv.push('--max-tokens', String(config.maxTokens));
    if (config.maxCost) argv.push('--max-cost', String(config.maxCost));
    if (config.timeLimit) argv.push('--time-limit', String(config.timeLimit));
    if (config.contextBytes) argv.push('--context-bytes', String(config.contextBytes));
    return argv;
  }

  function joinPath(base, ...rest) {
    if (!base) return rest.join('/');
    const trimmed = String(base).replace(/\/+$/, '');
    return [trimmed].concat(rest).join('/');
  }

  function hardTimeoutMs(config) {
    const grace = 15000;
    if (config.hardTimeoutMs) return Number(config.hardTimeoutMs);
    if (config.timeLimit) return Number(config.timeLimit) * 1000 + grace;
    return 120000 + grace;
  }

  function truncate(text, max) {
    const s = String(text || '');
    const limit = max || 4000;
    return s.length > limit ? s.slice(0, limit) + '...[truncated]' : s;
  }

  function runPrologRlm(config, command, extras, callback) {
    const { execFile } = require('node:child_process');
    const fs = require('node:fs');
    const swipl = config.swipl || 'swipl';
    const argv = buildArgv(config, command, extras);
    let cwd;
    if (config.rlmHome) {
      try { fs.statSync(config.rlmHome); cwd = config.rlmHome; } catch (_) { cwd = undefined; }
    }
    const options = {
      cwd,
      timeout: hardTimeoutMs(config),
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      env: process.env
    };
    execFile(swipl, argv, options, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          const e = new Error('failed to start runtime binary ' + swipl);
          e.code = 'RLM_SPAWN';
          return callback(e);
        }
        if (err.killed || err.signal === 'SIGKILL') {
          const e = new Error('prolog-rlm process timed out or was killed');
          e.code = 'RLM_TIMEOUT';
          return callback(e);
        }
        const e = new Error('prolog-rlm exited with status ' + err.code +
          (stderr ? ': ' + truncate(stderr, 2000) : ''));
        e.code = 'RLM_EXIT';
        e.exitCode = err.code;
        e.stderr = truncate(stderr, 4000);
        return callback(e);
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch (parseErr) {
        const e = new Error('prolog-rlm stdout was not valid JSON: ' + truncate(stdout, 2000));
        e.code = 'RLM_PARSE';
        e.stderr = truncate(stderr, 4000);
        return callback(e);
      }
      callback(null, envelope);
    });
  }

  function PrologRlmRuntimeNode(config) {
    RED.nodes.createNode(this, config);
    this.swipl = config.swipl || 'swipl';
    this.rlmHome = config.rlmHome || '';
    this.model = config.model || '';
    this.endpoint = config.endpoint || '';
    this.credentialEnv = config.credentialEnv || '';
    this.noCredential = !!config.noCredential;
    this.maxTokens = config.maxTokens || 0;
    this.maxCost = config.maxCost || '';
    this.timeLimit = config.timeLimit || 0;
    this.contextBytes = config.contextBytes || 0;
    this.hardTimeoutMs = config.hardTimeoutMs || 0;
  }

  RED.nodes.registerType('prolog-rlm-runtime', PrologRlmRuntimeNode);

  // Shared helpers exposed for sibling nodes in this palette and for tests.
  RED.nodes.prologRlm = { buildArgv, runPrologRlm, hardTimeoutMs, truncate, joinPath };
};
