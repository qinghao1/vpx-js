// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import controller from '../../res/scripts/controller.vbs'
import core from '../../res/scripts/core.vbs'
import sam from '../../res/scripts/sam.vbs'
import VPMKeys from '../../res/scripts/VPMKeys.vbs'
import WPC from '../../res/scripts/WPC.vbs'
import grammar from './grammar/grammar.bnf'

const MAP: Record<string, string> = {
	'controller.vbs': controller,
	'core.vbs': core,
	'sam.vbs': sam,
	'vpmkeys.vbs': VPMKeys,
	'wpc.vbs': WPC,
	'grammar.bnf': grammar,
}

/** getTextFile. */
export function getTextFile(fileName: string): string {
	const key = fileName.toLowerCase()
	if (MAP[key] !== undefined) return MAP[key]
	// Generic fallback: sam-driven tables all load core.vbs indirectly;
	// returning core ensures SolCallback / cvpmMagnet exist so script
	// can continue even when a niche VBS (capcom.vbs, etc.) is missing.
	// The VBS itself does `On Error Resume Next` around GetTextFile, so
	// returning empty would also be valid — but core is a safer default.
	if (key.endsWith('.vbs')) {
		console.warn(`[vbs] GetTextFile("${fileName}") not bundled — falling back to core.vbs`)
		return core
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
