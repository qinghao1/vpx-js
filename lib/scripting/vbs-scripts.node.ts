// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ERR } from './stdlib/err.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Committed set first; dev-only upstream checkout second.
const SEARCH_DIRS = [resolve(__dirname, '../../res/scripts'), resolve(__dirname, '../../external/vpinball/src/scripts')]

/** Whether a bundled text file exists. */
export function hasTextFile(fileName: string): boolean {
	try {
		getLocalPath(fileName)
		return true
	} catch {
		return false
	}
}

export function getTextFile(fileName: string): string {
	try {
		return readFileSync(getLocalPath(fileName)).toString('utf8')
	} catch {
		ERR.Raise(53, 'GetTextFile', `Unable to open ${fileName}`)
		// Raise returns in record mode (On Error Resume Next); the empty string is the fallback text.
		return ''
	}
}

function getLocalPath(fileName: string): string {
	const base = fileName.replace(/.*[\\/]/, '')
	for (const dir of SEARCH_DIRS) {
		const exact = resolve(dir, base)
		if (existsSync(exact)) return exact
		const lower = base.toLowerCase()
		// Names may be mixed-case; match case-insensitively.
		try {
			for (const entry of readdirSync(dir)) {
				if (entry.toLowerCase() === lower) {
					return resolve(dir, entry)
				}
			}
		} catch {
			// A search dir may be absent (packed tree, checkout without submodules).
		}
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
