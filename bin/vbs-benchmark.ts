#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, readFileSync } from 'fs'
import { Player, Progress } from '../lib/index.js'
import { Transpiler } from '../lib/scripting/transpiler.js'
import { logger } from '../lib/util/logger.js'
import { TableBuilder } from '../test/table-builder.js'

;(() => {
	try {
		const argVbs = process.argv[2]

		// mute progress logs
		Progress.setProgress({
			details(details: string): void {
				/* do nothing */
			},
			end(id: string): void {
				/* do nothing */
			},
			show(action: string, details?: string): void {
				/* do nothing */
			},
			start(id: string, title: string): void {
				/* do nothing */
			},
		})
		logger().debug = () => {
			/* do nothing */
		}

		if (!argVbs) {
			throw new Error('USAGE: vbs-benchmark <script.vbs>')
		}

		if (!existsSync(argVbs)) {
			throw new Error(`Cannot find "${argVbs}".`)
		}

		const vbs = readFileSync(argVbs).toString()
		const table = new TableBuilder().addFlipper('F1').build()
		const player = new Player(table).init()

		const transpiler = new Transpiler(table, player)
		console.log(transpiler.transpile(vbs))
	} catch (err) {
		console.error(err)
	} finally {
		process.exit()
	}
})()
