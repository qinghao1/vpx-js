// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFileSync } from 'fs'
import { resolve } from 'path'

/* istanbul ignore next: We don't test VB's core library. */
export function getTextFile(fileName: string): string {
	const filePath = getLocalPath(fileName)
	return readFileSync(filePath).toString('utf8')
}

/* istanbul ignore next: We don't test VB's core library. */
function getLocalPath(fileName: string): string {
	switch (fileName.toLowerCase()) {
		case 'controller.vbs':
			return resolve(__dirname, '../../res/scripts/controller.vbs')
		case 'core.vbs':
			return resolve(__dirname, '../../res/scripts/core.vbs')
		case 'vpmkeys.vbs':
			return resolve(__dirname, '../../res/scripts/VPMKeys.vbs')
		case 'wpc.vbs':
			return resolve(__dirname, '../../res/scripts/WPC.vbs')
		case 'grammar.bnf':
			return resolve(__dirname, './grammar/grammar.bnf')
	}
	throw new Error(`Cannot find text file ${fileName}`)
}
