# node-red-prolog-rlm

Node-RED nodes for the
[prolog-rlm](https://github.com/lost-rob0t/prolog-rlm) SWI-Prolog RLM/agent
runtime. The language model chooses semantic strategy; Prolog owns execution
semantics — these nodes keep it that way: every run shells out to the
documented prolog-rlm CLI and returns the portable trace-envelope JSON.

## Nodes

| Node | Kind | Purpose |
|------|------|---------|
| `prolog-rlm-runtime` | config | swipl binary, prolog-rlm checkout, provider + budget options |
| `rlm` | input/output | `prolog-rlm rlm QUERY --context … --json` -> envelope on `msg.payload` |
| `rlm-direct` | input/output | `prolog-rlm direct PROMPT --json` -> envelope on `msg.payload` |

Query/prompt falls back to `msg.payload`; context falls back to `msg.context`.

## Security model

- Credentials are referenced by **environment variable name** only. The value
  is read from the Node-RED process environment by prolog-rlm itself; it is
  never stored in flows, never placed in argv, never logged.
- Subprocesses spawn via `execFile` with argv arrays (no shell interpolation).
- A hard JS-side timeout SIGKILLs hung processes (`hard kill` in the config
  node; defaults to the CLI time limit + 15s grace).

## Install

Into your Node-RED userDir (`~/.node-red`):

```sh
cd ~/.node-red
npm install /path/to/this/checkout
```

You need a [prolog-rlm](https://github.com/lost-rob0t/prolog-rlm) checkout
and SWI-Prolog >= 9 on the Node-RED host; point the `prolog-rlm-runtime`
config node at both.

## Nix

```sh
nix flake check        # runs the deterministic node suite offline
nix develop            # node + swi-prolog shell
nix build .#palette    # palette layout under $out/lib/node_modules
```

## Verification

```sh
node --test                    # deterministic, offline
RLM_E2E=1 RLM_HOME=/path/to/prolog-rlm node --test   # live demo lane, no credentials
```

## License

MIT
