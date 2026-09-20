module.exports = function (RED) {
  'use strict';

  const helpers = RED.nodes.prologRlm;

  function RlmDirectNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.runtime = RED.nodes.getNode(config.runtime);

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (!node.runtime) {
        const e = new Error('missing prolog-rlm-runtime configuration');
        e.code = 'RLM_CONFIG';
        return done(e);
      }
      let prompt = (config.prompt || '').trim();
      if (!prompt) {
        if (msg.payload === undefined || msg.payload === null) {
          const e = new Error('no prompt: set the node prompt or provide msg.payload');
          e.code = 'RLM_CONFIG';
          return done(e);
        }
        prompt = String(msg.payload);
      }

      node.status({ fill: 'blue', shape: 'dot', text: 'running' });
      helpers.runPrologRlm(node.runtime, 'direct', [prompt], function (err, envelope) {
        if (err) {
          node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
          return done(err);
        }
        msg.payload = envelope;
        node.status({ fill: 'green', shape: 'dot', text: 'done' });
        send(msg);
        done();
      });
    });
  }

  RED.nodes.registerType('rlm-direct', RlmDirectNode);
};
