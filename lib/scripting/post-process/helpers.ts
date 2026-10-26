// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BlockStatement, Expression, Statement } from 'estree'
import { blockStatement, identifier, thisExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

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
	return flattenChildren(node)
}

function ppBlock(node: ESIToken): Statement {
	return blockStatement(flattenChildren(node))
}

function flattenChildren(node: ESIToken): Statement[] {
	const stmts: Statement[] = []
	for (const child of node.children) stmts.push(...(Array.isArray(child.estree) ? child.estree : [child.estree]))
	return stmts
}

/** ESTrees of all direct children of a given grammar type. */
export function collectChildren<T = unknown>(node: ESIToken, type: string): T[] {
	const out: T[] = []
	for (const child of node.children) if (child.type === type) out.push(child.estree)
	return out
}

/** Last `Block` child's ESTree, if any. */
export function findChildBlock(node: ESIToken): BlockStatement | undefined {
	let block: BlockStatement | undefined
	for (const child of node.children) if (child.type === 'Block') block = child.estree
	return block
}

/** Last `StatementsInline` child wrapped as a block, if any. */
export function findInlineBlock(node: ESIToken): BlockStatement | undefined {
	let inline: ESIToken | undefined
	for (const child of node.children) if (child.type === 'StatementsInline') inline = child
	return inline ? blockStatement(inline.estree) : undefined
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
	return collectChildren<Expression>(node, 'Bound')
}
