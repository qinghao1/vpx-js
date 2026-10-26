// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/* istanbul ignore next: We don't test VB's core library. */
/** Whether a bundled text file exists without fallback. */
export function hasTextFile(fileName: string): boolean {
	const base = fileName.replace(/.*[\\/]/, '')
	try {
		const p = getLocalPath(base)
		readFileSync(p)
		return true
	} catch {
		try {
			const p2 = getLocalPath(fileName)
			readFileSync(p2)
			return true
		} catch {
			return false
		}
	}
}

/** getTextFile. */
export function getTextFile(fileName: string): string {
	return readFileSync(getLocalPath(fileName)).toString('utf8')
}

/* istanbul ignore next: We don't test VB's core library. */
function getLocalPath(fileName: string): string {
	switch (fileName.toLowerCase()) {
		case 'controller.vbs':
			return resolve(__dirname, '../../res/scripts/controller.vbs')
		case 'core.vbs':
			return resolve(__dirname, '../../res/scripts/core.vbs')
		case 'sam.vbs':
			return resolve(__dirname, '../../res/scripts/sam.vbs')
		case 'vpmkeys.vbs':
			return resolve(__dirname, '../../res/scripts/VPMKeys.vbs')
		case 'wpc.vbs':
			return resolve(__dirname, '../../res/scripts/WPC.vbs')
	}
	// Unknown VBS: try res/scripts/<name> then vpinball/scripts/<name> before falling back
	const lower = fileName.toLowerCase()
	const candidates = [
		resolve(__dirname, `../../res/scripts/${fileName}`),
		resolve(__dirname, `../../res/scripts/${lower}`),
	]
	for (const c of candidates) {
		readFileSync(c)
		return c
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
