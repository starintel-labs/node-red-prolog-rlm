module.exports = function (RED) {
  'use strict';

  const helpers = require('../lib/prolog-rlm-subprocess');

  function RlmNode(config) {
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
      let query = (config.query || '').trim();
      if (!query) {
        if (msg.payload === undefined || msg.payload === null) {
          const e = new Error('no query: set the node query or provide msg.payload');
          e.code = 'RLM_CONFIG';
          return done(e);
        }
        query = String(msg.payload);
      }
      let context = config.context || '';
      if (!context && msg.context !== undefined && msg.context !== null) {
        context = typeof msg.context === 'string' ? msg.context : JSON.stringify(msg.context);
      }
      const extras = [query];
      if (context) extras.push('--context', context);

      node.status({ fill: 'blue', shape: 'dot', text: 'running' });
      helpers.runPrologRlm(node.runtime, 'rlm', extras, function (err, envelope) {
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

  RED.nodes.registerType('rlm', RlmNode);
};
