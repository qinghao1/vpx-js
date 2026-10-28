# Scripting (VBS → JS)

Table scripts are VBScript. `Transpiler` (`transpiler.ts`) compiles them to JS
and `eval`s the result. There is no interpreter: VBS semantics are emulated by
generated code plus runtime helpers.

## Pipeline

```
table script (.vbs)
  │ normalizeNewCall          transpiler-pipeline.ts: pre-pass outside string
  │                           literals: `(New C)(args)` desugar, Option/switch rename
  ▼
Grammar.format                grammar/grammar.ts: strip comments, join `_`
  │                           continuations, normalize keyword case
  ▼
Parser (RULES)                grammar/rules.ts (generated, see below)
  │                           EBNF parse via `ebnf` package → token tree
  ▼
post-process (pp*)            post-process/*.ts: token tree → ESTree.
  │                           One module per construct (expr, call, loop, ...).
  ▼
buildPipeline (9 stages)      transpiler-pipeline.ts — shared by sync + worker:
  │                           FunctionHoist → Event → Error → Reference →
  │                           Scope → Class(this) → Ambiguity → Class → Wrap
  ▼
escodegen                     ESTree → JS source string
  │
  ▼
eval + play(...)              transpiler.ts: evals JS, calls the wrapped `play`
                              function with the 7 namespaces below
```

`transpile(vbs)` returns JS without running it. `execute(vbs, scope)` transpiles,
evals, and calls `play`. `bin/vbs2js.ts` exposes the same for the CLI.
`execute` needs `eval` of generated code, so a hosting page must allow `unsafe-eval` in its CSP.

## The 7 namespaces

`WrapTransformer` wraps the program in
`play(__scope, __items, __enums, __global, __stdlib, __vbs, __player)`.
Earlier transformers rewrite every bare identifier to one of these roots:

| Param | Value (from `Transpiler`) | Holds |
|---|---|---|
| `__scope` | `new Proxy(scope, VbsProxyHandler)` | Script-level `Dim`s / globals |
| `__items` | `table.getElementApis()` | Playfield item APIs (`Drain_Hit` targets) |
| `__enums` | `Enums` | VPX enum constants |
| `__global` | `GlobalApi` | `GetPlayer`, table-wide functions |
| `__stdlib` | `Stdlib` | VBS builtins (`MsgBox`, `CInt`, `Mid`, ...) |
| `__vbs` | `VBSHelper` | Operators/statements JS can't express |
| `__player` | `Player` | Game services (audio, emu, input) |

Name resolution order lives in `ReferenceTransformer` + `AmbiguityTransformer`:
locals → items → enums → global → stdlib. Case-insensitivity comes from
`VbsProxyHandler` (proxy over `__scope`) plus `_getPropertyName` maps on APIs —
VBS `drain.destroyball` must find `Drain.DestroyBall`.

## VBSHelper vs Stdlib vs vbs-values

Three layers, split by who calls them:

- `stdlib/` — things the *script* calls by name: `CStr`, `Split`, `Rnd`,
  `CreateObject`, `Err`, `vbCrLf`, ... Extends `VbsApi` (case-insensitive
  dispatch). Pure functions over VBS values.
- `vbs-helper.ts` (`__vbs`) — things *generated code* calls: `equals`, `and/or/
  xor/eqv/not`, `intDiv`, `getOrCall`, `dim/redim/erase`, `toIterable`,
  `transpileInline`, `onErrorResumeNext`. These implement operators and
  statements, not builtins.
- `vbs-values.ts` — shared value semantics both use (`vbsEquals`, `vbsAnd`,
  `bankersRound`, ...). No classes, no state.

`vbs-undefined.ts` (`VbsUndefined`/`UNDEFINED`) is the late-binding null:
unknown members evaluate to it instead of throwing, so a missing emu property
renders as `Empty`-ish rather than crashing the script.

## Grammar workflow

`grammar.bnf` is the source of truth. `rules.ts` is generated:

```
npm run build:pre   # build/compile-rules.ts: grammar.bnf → rules.ts
```

Never hand-edit `rules.ts` — it is overwritten on every build. `grammar.spec.ts`
pins current parse behavior; add a case there when extending the `.bnf`.

## Worker architecture

`transpileAsync` / `executeAsync` move compilation off the main thread:
`transpiler-worker-pool.ts` (pool) → `transpiler.worker.node.ts` /
`.browser.ts` (entry) → `transpileInWorker` (`transpiler-worker-core.ts`).
The worker can't see the `Table`, so the main thread ships a
`TableDataPayload` (element names, events, API shapes) and the worker rebuilds
mocks, then runs the *same* `buildPipeline`. If sync and worker output ever
diverge, the bug is in the mocks, not the pipeline.

## VBScript value primer

The semantics the runtime emulates, for readers coming from JS:

- `Empty` (unassigned/`Dim` without value) coerces to `0`/`''`; `Null`
  propagates through operators and fails conversions with 94; `Nothing`
  (uninitialized objects) fails member access and conversions with 91.
- `True` is `-1`, not `1`. Bitwise `And`/`Or`/`Xor`/`Eqv`/`Not` and `\`
  banker's-round (halves to even) via `bankersRound` before operating.
- Numeric strings parse like literals, including `&H` hex and `&O` octal;
  anything else is a type mismatch (13), and a non-finite result is an
  overflow (6).

## Known divergences from VBScript

Accepted limitations for newcomers porting scripts:

- `Imp` is not in the grammar (only `Eqv`); scripts using it fail to parse.
- `ByRef` parses but parameters pass by value (JS has no by-ref).
- `Option Explicit` parses but is not enforced; undeclared variables still work.
- `On Error Resume Next` swallows via `ERR` (`stdlib/err.ts`); only
  `On Error GoTo 0` (re-arm) is supported — any other `GoTo` target fails
  to parse.
- Bitwise `And/Or/Xor/Not` on non-integers follow `vbs-values.ts`, which favors
  numeric coercion over strict VBS `Variant` rules.
