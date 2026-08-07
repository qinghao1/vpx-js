// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { assignmentExpression, expressionStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** ppAssign. */
export function ppAssign(node: ESIToken): unknown {
	switch (node.type) {
		case 'RegularAssignmentStatement':
		case 'RegularAssignmentStatementInline':
			return ppRegularAssignmentStatement(node)
		case 'SetAssignmentStatement':
		case 'SetAssignmentStatementInline':
			return ppSetAssignmentStatement(node)
	}
	return null
}

function ppRegularAssignmentStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	const rightExpr = node.children[2].estree
	return expressionStatement(assignmentExpression(expr, '=', rightExpr))
}

function ppSetAssignmentStatement(node: ESIToken): unknown {
	const stmts = []
	const expr = node.children[0].estree
	const rightExpr = node.children[2].estree
	stmts.push(expressionStatement(assignmentExpression(expr, '=', rightExpr)))
	if (rightExpr.type === 'NewExpression' && node.children.length > 3) {
		if (node.children[3].type === 'NothingLiteral') {
			stmts.push(expressionStatement(assignmentExpression(expr, '=', node.children[3].estree)))
		}
	}
	return stmts
}
