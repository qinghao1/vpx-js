#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Player } from '../lib/index.js'
import { Transpiler } from '../lib/scripting/transpiler.js'
import { logger } from '../lib/util/logger.js'
import { TableBuilder } from '../test/table-builder.js'
import { readInputFile, run, silenceProgress } from './cli.js'

run(() => {
	silenceProgress()
	logger().debug = () => {
		/* do nothing */
	}

	const vbs = readInputFile(process.argv[2], 'USAGE: vbs-benchmark <script.vbs>')
	const table = new TableBuilder().addFlipper('F1').build()
	const player = new Player(table).init()

	const transpiler = new Transpiler(table, player)
	const started = Date.now()
	const javaScript = transpiler.transpile(vbs)
	const elapsed = Date.now() - started
	console.log(javaScript)
	console.error(`[vbs-benchmark] transpiled ${vbs.length} chars -> ${javaScript.length} chars in ${elapsed}ms`)
})
