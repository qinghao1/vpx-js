// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { breakStatement, returnStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

export function ppBranch(node: ESIToken): any {
	switch (node.type) {
		case 'ExitStatement':
		case 'ExitStatementInline':
			return ppExitStatement(node)
	}
	return null
}

function ppExitStatement(node: ESIToken): any {
	const kind = node.children[0].text
	return kind === 'Do' || kind === 'For' ? breakStatement() : returnStatement(null)
}
