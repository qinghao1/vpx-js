// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import controller from '../../res/scripts/controller.vbs'
import core from '../../res/scripts/core.vbs'
import sam from '../../res/scripts/sam.vbs'
import VPMKeys from '../../res/scripts/VPMKeys.vbs'
import WPC from '../../res/scripts/WPC.vbs'
import grammar from './grammar/grammar.bnf'

import { ERR } from './stdlib/err.js'

const MAP: Record<string, string> = {
	'controller.vbs': controller,
	'core.vbs': core,
	'sam.vbs': sam,
	'vpmkeys.vbs': VPMKeys,
	'wpc.vbs': WPC,
	'grammar.bnf': grammar,
}

/** Whether a bundled text file exists without fallback. */
export function hasTextFile(fileName: string): boolean {
	const base = fileName.replace(/.*[\\/]/, '').toLowerCase()
	if (MAP[base] !== undefined) return true
	return MAP[fileName.toLowerCase()] !== undefined
}

/** getTextFile. */
export function getTextFile(fileName: string): string {
	const lower = fileName.toLowerCase()
	if (MAP[lower] !== undefined) return MAP[lower]
	const base = fileName.replace(/.*[\\/]/, '').toLowerCase()
	if (MAP[base] !== undefined) return MAP[base]
	ERR.Raise(53, 'GetTextFile', `Unable to open ${fileName}`)
	return ''
}
