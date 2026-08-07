// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { CallExpression, Expression, Statement } from 'estree'
import { blockStatement, callExpression, identifier, memberExpression, thisExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** Generic post-processors for shared grammar nodes. */
export function ppHelpers(node: ESIToken): unknown {
	switch (node.type) {
		case 'Statements':
		case 'StatementsInline':
			return ppStatements(node)
		case 'Block':
			return ppBlock(node)
		case 'ArrayTypeModifiers':
			return ppArrayTypeModifiers()
		case 'ArraySizeInitializationModifier':
			return ppArraySizeInitializationModifier(node)
		case 'BoundList':
			return ppBoundList(node)
		case 'Identifier':
		case 'IdentifierOrKeyword':
			return ppIdentifier(node)
		case 'ArgumentList':
			return ppArgumentList(node)
	}
	return null
}

function ppStatements(node: ESIToken): Statement[] {
	const stmts: Statement[] = []
	for (const child of node.children) stmts.push(...(Array.isArray(child.estree) ? child.estree : [child.estree]))
	return stmts
}

function ppBlock(node: ESIToken): Statement {
	const stmts: Statement[] = []
	for (const child of node.children) stmts.push(...(Array.isArray(child.estree) ? child.estree : [child.estree]))
	return blockStatement(stmts)
}

function ppIdentifier(node: ESIToken): Expression {
	return node.text === 'Me' ? thisExpression() : identifier(node.text)
}

function ppArgumentList(node: ESIToken): Expression[] {
	const estree: Expression[] = []
	if (node.children.length > 0) {
		let prev: ESIToken | null = null
		for (const child of node.children) {
			switch (child.type) {
				case 'Expression':
					estree.push(child.estree)
					break
				case 'ArgumentList':
					estree.push(...child.estree)
					break
				case 'Comma':
					if (prev === null || prev.type === 'Comma') estree.push(identifier('undefined'))
					break
			}
			prev = child
		}
		if (node.children[node.children.length - 1].type === 'Comma') estree.push(identifier('undefined'))
	}
	return estree
}

function ppArrayTypeModifiers(): unknown[] {
	return []
}

function ppArraySizeInitializationModifier(node: ESIToken): unknown {
	return node.children[1].estree
}

function ppBoundList(node: ESIToken): Expression[] {
	const exprs: Expression[] = []
	for (const expr of node.children) if (expr.type === 'Bound') exprs.push(expr.estree)
	return exprs
}

/** Wraps a callee with `__vbs.getOrCall`. */
export function getOrCall(callee: Expression, arg?: Expression): CallExpression {
	return callExpression(
		memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('getOrCall')),
		arg ? [callee, arg] : [callee],
	)
}
