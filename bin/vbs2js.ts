#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Grammar } from '../lib/scripting/grammar/grammar.js'
import { readInputFile, run, silenceProgress } from './cli.js'

run(() => {
	const grammar = new Grammar()
	const cliArgs = process.argv.slice(2)
	const formatOnly = cliArgs.includes('--format-only')
	const argVbs = cliArgs.find(a => a !== '--format-only' && !a.startsWith('-'))

	silenceProgress()

	const vbs = readInputFile(argVbs, 'USAGE: vbs2js [--format-only] <script.vbs>')

	console.log(formatOnly ? grammar.format(vbs) : grammar.vbsToJs(vbs))
})
