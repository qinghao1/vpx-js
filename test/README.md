# test/

Unit specs live next to the code they cover (`lib/**/*.spec.ts`,
`test/harness/*.spec.ts`, `demo-browser/src/**/*.spec.ts`; run with
`npm test`). Table-gated cases (empty-table probes, TWD/Cadet fixtures) skip
honestly when their fixtures are absent — CI has no VPX/ROM.

End-to-end lives in `test/harness/` — start at
[`test/harness/README.md`](harness/README.md) (`verify-all.ts` is the single
entry). Manual table-gated repros live in `test/manual/` (never in CI), and
`test/bench/` holds browser micro-benchmarks.
