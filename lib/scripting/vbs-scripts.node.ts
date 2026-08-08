// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'fs'
import { resolve } from 'path'

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
	const filePath = getLocalPath(fileName)
	try {
		return readFileSync(filePath).toString('utf8')
	} catch (e: any) {
		const key = fileName.toLowerCase()
		if (key.endsWith('.vbs')) {
			// Fall back to core.vbs so SolCallback / cvpmMagnet remain defined
			try {
				return readFileSync(resolve(__dirname, '../../res/scripts/core.vbs')).toString('utf8')
			} catch {}
		}
		throw new Error(`Cannot find text file ${fileName}: ${e?.message}`)
	}
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
		case 'grammar.bnf':
			return resolve(__dirname, './grammar/grammar.bnf')
	}
	// Unknown VBS: try res/scripts/<name> then vpinball/scripts/<name> before falling back
	const lower = fileName.toLowerCase()
	const candidates = [
		resolve(__dirname, `../../res/scripts/${fileName}`),
		resolve(__dirname, `../../res/scripts/${lower}`),
	]
	for (const c of candidates) {
		try {
			readFileSync(c)
			return c
		} catch {}
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
