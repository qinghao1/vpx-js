// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import controller from '../../res/scripts/controller.vbs?raw'
import core from '../../res/scripts/core.vbs?raw'
import sam from '../../res/scripts/sam.vbs?raw'
import sys80 from '../../res/scripts/sys80.vbs?raw'
import VPMKeys from '../../res/scripts/VPMKeys.vbs?raw'
import WPC from '../../res/scripts/WPC.vbs?raw'

import { ERR } from './stdlib/err.js'

// Browser embeds only the committed subset; the rest resolve node-side via the upstream checkout.
const MAP: Record<string, string> = {
	'controller.vbs': controller,
	'core.vbs': core,
	'sam.vbs': sam,
	'sys80.vbs': sys80,
	'vpmkeys.vbs': VPMKeys,
	'wpc.vbs': WPC,
}

/** Whether a bundled text file exists. */
export function hasTextFile(fileName: string): boolean {
	return MAP[fileName.replace(/.*[\\/]/, '').toLowerCase()] !== undefined
}

export function getTextFile(fileName: string): string {
	const text = MAP[fileName.replace(/.*[\\/]/, '').toLowerCase()]
	if (text !== undefined) return text
	ERR.Raise(53, 'GetTextFile', `Unable to open ${fileName}`)
	return ''
}
