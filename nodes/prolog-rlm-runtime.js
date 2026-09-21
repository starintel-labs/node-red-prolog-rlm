module.exports = function (RED) {
  'use strict';

  const helpers = require('../lib/prolog-rlm-subprocess');

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

  // Exposed for convenience only; sibling nodes require the lib module
  // directly because RED views differ per node file in the runtime loader.
  RED.nodes.prologRlm = helpers;
};
