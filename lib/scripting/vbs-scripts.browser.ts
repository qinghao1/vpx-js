// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import controller from '../../res/scripts/controller.vbs'
import core from '../../res/scripts/core.vbs'
import VPMKeys from '../../res/scripts/VPMKeys.vbs'
import WPC from '../../res/scripts/WPC.vbs'
import grammar from './grammar/grammar.bnf'

/** getTextFile. */
export function getTextFile(fileName: string): string {
	switch (fileName.toLowerCase()) {
		case 'controller.vbs':
			return controller
		case 'core.vbs':
			return core
		case 'vpmkeys.vbs':
			return VPMKeys
		case 'wpc.vbs':
			return WPC
		case 'grammar.bnf':
			return grammar
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
