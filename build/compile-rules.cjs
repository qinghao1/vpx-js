const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const { Grammars } = require('ebnf')
const { inspect } = require('util')
const bnfGrammar = readFileSync(resolve(__dirname, '../lib/scripting/grammar/grammar.bnf')).toString()
const fileDest = resolve(__dirname, '../lib/scripting/grammar/rules.ts')
const rules = Grammars.Custom.getRules(bnfGrammar)
const rulesExport = `import type { IRule } from 'ebnf';
export const RULES: IRule[] = ${inspect(rules, { depth: 20, maxArrayLength: null })} as IRule[];
`
writeFileSync(fileDest, rulesExport)
console.log(`Wrote ${fileDest}`)
