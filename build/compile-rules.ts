// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { Grammars } from 'ebnf'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bnfGrammar = readFileSync(resolve(__dirname, '../lib/scripting/grammar/grammar.bnf')).toString()
const fileDest = resolve(__dirname, '../lib/scripting/grammar/rules.ts')
const rules = Grammars.Custom.getRules(bnfGrammar)
const rulesExport = `import type { IRule } from 'ebnf';
export const RULES: IRule[] = ${inspect(rules, { depth: 20, maxArrayLength: null })} as IRule[];
`
writeFileSync(fileDest, rulesExport)
console.log(`Wrote ${fileDest}`)
