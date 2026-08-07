// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { callExpression, expressionStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** ppCall. */
export function ppCall(node: ESIToken): any {
	switch (node.type) {
		case 'InvocationStatement':
		case 'InvocationStatementInline':
			return ppInvocationStatement(node)
	}
	return null
}

function ppInvocationStatement(node: ESIToken): any {
	const expr = node.children[0].estree
	return expressionStatement(expr.type === 'CallExpression' ? expr : callExpression(expr, []))
}
