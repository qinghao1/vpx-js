// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BlockStatement, Expression, Identifier, LabeledStatement, Statement } from 'estree'
import {
	assignmentExpression,
	binaryExpression,
	blockStatement,
	breakStatement,
	callExpression,
	conditionalExpression,
	doWhileStatement,
	forOfStatement,
	forStatement,
	identifier,
	ifStatement,
	literal,
	memberExpression,
	whileStatement,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'
import { findChildBlock, findInlineBlock } from './helpers.js'

/** Statement labels binding `Exit Do` / `Exit For` to the nearest same-kind loop. */
export const EXIT_DO_LABEL = '__exitDo'
export const EXIT_FOR_LABEL = '__exitFor'

const DO_LOOP_TYPES = ['WhileStatement', 'DoTopLoopStatement', 'DoBottomLoopStatement']
const FOR_LOOP_TYPES = ['ForStatement', 'ForStatementInline', 'ForEachStatement', 'ForEachStatementInline']

/** Label for a `Do` loop token: same-kind nesting depth keeps nested labels unique (duplicates are a SyntaxError). */
export function doLabelForLoop(node: ESIToken): string {
	return exitLabel(EXIT_DO_LABEL, loopDepth(node, DO_LOOP_TYPES))
}

/** Label for a `For` loop token: same-kind nesting depth keeps nested labels unique (duplicates are a SyntaxError). */
export function forLabelForLoop(node: ESIToken): string {
	return exitLabel(EXIT_FOR_LABEL, loopDepth(node, FOR_LOOP_TYPES))
}

/**
 * Label for an `Exit Do` token: the label of the nearest enclosing `Do` loop,
 * so the break binds that loop and not an inner `For` loop. Without an
 * enclosing loop (invalid VBS) falls back to the depth-0 label.
 */
export function doLabelForExit(node: ESIToken): string {
	return exitLabelForExit(node, EXIT_DO_LABEL, DO_LOOP_TYPES)
}

/**
 * Label for an `Exit For` token: the label of the nearest enclosing `For`
 * loop, so the break binds that loop and not an inner `Do` loop. Without an
 * enclosing loop (invalid VBS) falls back to the depth-0 label.
 */
export function forLabelForExit(node: ESIToken): string {
	return exitLabelForExit(node, EXIT_FOR_LABEL, FOR_LOOP_TYPES)
}

function exitLabelForExit(node: ESIToken, baseLabel: string, loopTypes: string[]): string {
	let current: ESIToken | undefined = node.parent
	while (current) {
		if (loopTypes.includes(current.type)) {
			return exitLabel(baseLabel, loopDepth(current, loopTypes))
		}
		current = current.parent
	}
	return baseLabel
}

function exitLabel(baseLabel: string, depth: number): string {
	return depth === 0 ? baseLabel : `${baseLabel}${depth}`
}

function loopDepth(node: ESIToken, loopTypes: string[]): number {
	let depth = 0
	let current: ESIToken | undefined = node.parent
	while (current) {
		if (loopTypes.includes(current.type)) depth++
		current = current.parent
	}
	return depth
}

/** ppLoop. */
export function ppLoop(node: ESIToken): unknown {
	switch (node.type) {
		case 'WhileStatement':
			return ppWhileStatement(node)
		case 'DoTopLoopStatement':
			return ppDoTopLoopStatement(node)
		case 'DoBottomLoopStatement':
			return ppDoBottomLoopStatement(node)
		case 'ForStatement':
		case 'ForStatementInline':
			return ppForStatement(node)
		case 'ForEachStatement':
		case 'ForEachStatementInline':
			return ppForEachStatement(node)
	}
	return null
}

function ppWhileStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	const block = node.children[2].type === 'Block' ? node.children[2].estree : null
	return labeledLoop(doLabelForLoop(node), whileStatement(expr, block ? block : blockStatement([])))
}

function ppDoTopLoopStatement(node: ESIToken): unknown {
	const block = findChildBlock(node) ?? blockStatement([])
	if (node.children[0].type === 'WhileOrUntil') {
		if (node.children[0].text === 'While') {
			const expr = node.children[1].estree
			return labeledLoop(doLabelForLoop(node), whileStatement(expr, block))
		} else {
			const expr = node.children[1].estree
			block.body.unshift(ifStatement(expr, breakStatement(), null))
			return labeledLoop(doLabelForLoop(node), doWhileStatement(block, literal(true)))
		}
	} else {
		return labeledLoop(doLabelForLoop(node), doWhileStatement(block, literal(true)))
	}
}

function ppDoBottomLoopStatement(node: ESIToken): unknown {
	let block = node.children[1].type === 'Block' ? node.children[1].estree : null
	let whileOrUntil
	let expr
	if (block !== null) {
		whileOrUntil = node.children[2].text
		expr = node.children[3].estree
	} else {
		whileOrUntil = node.children[1].text
		expr = node.children[2].estree
	}
	if (whileOrUntil === 'While') {
		return labeledLoop(doLabelForLoop(node), doWhileStatement(block ? block : blockStatement([]), expr))
	} else {
		if (block === null) {
			block = blockStatement([])
		}
		block.body.push(ifStatement(expr, breakStatement(), null))
		return labeledLoop(doLabelForLoop(node), doWhileStatement(block, literal(true)))
	}
}

function labeledLoop(label: string, loop: Statement): LabeledStatement {
	return { type: 'LabeledStatement', label: identifier(label), body: loop }
}

function ppForStatement(node: ESIToken): unknown {
	const id = node.children[0].estree
	const expr = node.children[2].estree
	const expr2 = node.children[3].estree
	let step = null
	if (node.children[4].type === 'ForStep') {
		step = node.children[5].estree
	}
	const block = findChildBlock(node) ?? findInlineBlock(node)
	return labeledLoop(
		forLabelForLoop(node),
		forStatement(
			assignmentExpression(id, '=', expr),
			step
				? conditionalExpression(
						binaryExpression('<', step, literal(0)),
						binaryExpression('>=', id, expr2),
						binaryExpression('<=', id, expr2),
					)
				: binaryExpression('<=', id, expr2),
			assignmentExpression(id, '+=', step ? step : literal(1)),
			block ? block : blockStatement([]),
		),
	)
}

function ppForEachStatement(node: ESIToken): unknown {
	let id: Identifier = identifier('undefined')
	let expr: Expression = identifier('undefined')
	let block: BlockStatement | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'LoopControlVariable':
				id = child.estree
				break
			case 'Expression':
				expr = child.estree
				break
			case 'Block':
				block = child.estree
				break
			case 'StatementsInline':
				block = blockStatement(child.estree)
				break
		}
	}
	const safeExpr = callExpression(
		memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('toIterable')),
		[expr],
	)
	return labeledLoop(forLabelForLoop(node), forOfStatement(id, safeExpr, block ? block : blockStatement([])))
}
