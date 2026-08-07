// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { AssignmentExpression, CallExpression, Expression, Statement } from 'estree'
import {
	arrayExpression,
	assignmentExpression,
	callExpression,
	expressionStatement,
	identifier,
	literal,
	memberExpression,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** ppArray. */
export function ppArray(node: ESIToken): any {
	switch (node.type) {
		case 'RedimStatement':
		case 'RedimStatementInline':
			return ppRedimStatement(node)
		case 'RedimClauses':
			return ppRedimClauses(node)
		case 'RedimClause':
			return ppRedimClause(node)
		case 'EraseStatement':
		case 'EraseStatementInline':
			return ppEraseStatement(node)
		case 'EraseExpressions':
			return ppEraseExpressions(node)
	}
	return null
}

function ppRedimStatement(node: ESIToken): any {
	const stmts: Statement[] = []
	const exprs: AssignmentExpression[] = node.children[0].estree
	for (const expr of exprs) {
		if (node.text.startsWith('ReDim Preserve ')) {
			;(expr.right as CallExpression).arguments.push(literal(true))
		}
		stmts.push(expressionStatement(expr))
	}
	return stmts
}

function ppRedimClauses(node: ESIToken): any {
	const estree = []
	for (const child of node.children) {
		if (child.type === 'RedimClause') {
			estree.push(child.estree)
		}
	}
	return estree
}

function ppRedimClause(node: ESIToken): any {
	const id = node.children[0].estree
	const args = node.children[1].estree
	return assignmentExpression(
		id,
		'=',
		callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('redim')), [
			id,
			arrayExpression(args),
		]),
	)
}

function ppEraseStatement(node: ESIToken): any {
	const estree = []
	const exprs = node.children[0].estree as Expression[]
	for (const expr of exprs) {
		estree.push(expressionStatement(expr))
	}
	return estree
}

function ppEraseExpressions(node: ESIToken): any {
	const estree = []
	for (const child of node.children) {
		if (child.type === 'Expression') {
			estree.push(
				assignmentExpression(
					child.estree,
					'=',
					callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('erase')), [child.estree]),
				),
			)
		}
	}
	return estree
}
