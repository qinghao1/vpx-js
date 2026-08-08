#!/usr/bin/env node
// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, readFileSync } from 'node:fs'
import { Progress } from '../lib/index.js'
import { Grammar } from '../lib/scripting/grammar/grammar.js'

;(() => {
	try {
		const grammar = new Grammar()
		const argVbs = process.argv[2]
		const formatOnly = process.argv[3] === '--format-only'

		// mute progress logs
		Progress.setProgress({
			details(_details: string): void {
				/* do nothing */
			},
			end(_id: string): void {
				/* do nothing */
			},
			show(_action: string, _details?: string): void {
				/* do nothing */
			},
			start(_id: string, _title: string): void {
				/* do nothing */
			},
		})

		if (!argVbs) {
			throw new Error('USAGE: vbs2js <script.vbs> --format-only')
		}

		if (!existsSync(argVbs)) {
			throw new Error(`Cannot find "${argVbs}".`)
		}

		const vbs = readFileSync(argVbs).toString()

		if (!formatOnly) {
			console.log(grammar.vbsToJs(vbs))
		} else {
			console.log(grammar.format(vbs))
		}
	} catch (err) {
		console.error(err)
	} finally {
		process.exit()
	}
})()
