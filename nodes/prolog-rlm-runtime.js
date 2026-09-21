module.exports = function (RED) {
  'use strict';

  const helpers = require('../lib/prolog-rlm-subprocess');

  const PROVIDER_PRESETS = {
    'llm.starintel.actor': {
      endpoint: 'https://llm.starintel.actor/v1/chat/completions',
      credentialEnv: 'STARINTEL_LLM_API_KEY',
      model: 'qwen3-8b'
    }
  };

  function PrologRlmRuntimeNode(config) {
    RED.nodes.createNode(this, config);
    const preset = PROVIDER_PRESETS[config.provider];
    this.swipl = config.swipl || 'swipl';
    this.rlmHome = config.rlmHome || '';
    this.provider = config.provider || 'custom';
    this.model = config.model || (preset && preset.model) || '';
    this.endpoint = config.endpoint || (preset && preset.endpoint) || '';
    this.credentialEnv = config.credentialEnv || (preset && preset.credentialEnv) || '';
    this.noCredential = !!config.noCredential;
    this.maxTokens = config.maxTokens || 0;
    this.maxCost = config.maxCost || '';
    this.timeLimit = config.timeLimit || 0;
    this.contextBytes = config.contextBytes || 0;
    this.hardTimeoutMs = config.hardTimeoutMs || 0;
  }

  RED.nodes.registerType('prolog-rlm-runtime', PrologRlmRuntimeNode);

  // Exposed for convenience only; sibling nodes require the lib module
  // directly because RED views differ per node file in the runtime loader.
  RED.nodes.prologRlm = helpers;
};
