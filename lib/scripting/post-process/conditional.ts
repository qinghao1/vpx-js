// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BlockStatement, Expression, Statement } from 'estree'
import {
	blockStatement,
	callExpression,
	expressionStatement,
	identifier,
	ifStatement,
	logicalExpression,
	memberExpression,
	variableDeclaration,
	variableDeclarator,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'
import { collectChildren, findChildBlock, findInlineBlock, vbsTest } from './helpers.js'

/** Temp holding the `Select Case` discriminant (evaluated once, like VBS). */
const SELECT_TEMP = '__vbsSelect'

/** Transforms VBS conditional constructs into ESTree. */
export function ppConditional(node: ESIToken): unknown {
	switch (node.type) {
		case 'BlockIfStatement':
			return ppBlockIfStatement(node)
		case 'ElseIfStatement':
		case 'ElseIfStatementInline':
			return ppElseIfStatement(node)
		case 'ElseStatement':
			return ppElseStatement(node)
		case 'LineIfThenStatement':
			return ppLineIfThenStatement(node)
		case 'SelectStatement':
			return ppSelectStatement(node)
		case 'CaseStatement':
			return ppCaseStatement(node)
		case 'CaseClauses':
			return ppCaseClauses(node)
		case 'CaseElseStatement':
			return ppCaseElseStatement(node)
	}
	return null
}

function ppBlockIfStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	let alternate: any = null
	for (const child of node.children) {
		if (['ElseIfStatement', 'ElseIfStatementInline', 'ElseStatement'].includes(child.type)) {
			if (alternate === null) alternate = child.estree
			else {
				let tmp = alternate
				while (tmp.alternate !== null) tmp = tmp.alternate
				tmp.alternate = child.estree
			}
		}
	}
	return ifStatement(vbsTest(expr), findChildBlock(node) ?? blockStatement([]), alternate)
}

function ppElseIfStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	return ifStatement(vbsTest(expr), findChildBlock(node) ?? findInlineBlock(node) ?? blockStatement([]), null)
}

function ppElseStatement(node: ESIToken): unknown {
	const inline = findInlineBlock(node)
	const block = findChildBlock(node)
	if (inline && block) return blockStatement([...inline.body, ...block.body])
	return block ?? inline ?? blockStatement([])
}

function ppLineIfThenStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	const stmts = node.children[1].estree
	const elseStmts = node.children.length > 2 ? node.children[2].estree : null
	return ifStatement(vbsTest(expr), blockStatement(stmts), elseStmts ? blockStatement(elseStmts) : null)
}

interface CaseBranch {
	tests: Expression[]
	block: BlockStatement
}

function ppSelectStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree as Expression
	const cases: CaseBranch[] = []
	let elseBlock: BlockStatement | null = null
	for (const child of node.children) {
		if (child.type === 'CaseStatement') cases.push(child.estree as CaseBranch)
		else if (child.type === 'CaseElseStatement' && elseBlock === null) elseBlock = child.estree as BlockStatement
	}
	if (cases.length === 0) {
		// No branches: still evaluate the discriminant once for side effects.
		return expressionStatement(expr)
	}
	// An if/else chain over `__vbs.equals` (VBS `=` semantics: `True` is `-1`,
	// `Empty` matches `0`/`''`, `Null` matches nothing). A JS `switch` uses
	// `===` and gets all of those wrong. Empty branches are kept so a match
	// never falls through to a later case.
	const tmp = selectTemp(node)
	let alternate: Statement | null = elseBlock
	for (let i = cases.length - 1; i >= 0; i--) {
		const { tests, block } = cases[i]
		let test: Expression = equalsSelect(tmp, tests[0])
		for (let j = 1; j < tests.length; j++) test = logicalExpression('||', test, equalsSelect(tmp, tests[j]))
		alternate = ifStatement(test, block, alternate)
	}
	return blockStatement([
		variableDeclaration('let', [variableDeclarator(identifier(tmp), expr)]),
		alternate as Statement,
	])
}

/**
 * Temp name for one `Select Case`. Nested selects need distinct temps: the
 * scope analysis has no block scopes, so an inner select would otherwise
 * clobber the outer discriminant still needed by later `Else If` tests.
 */
function selectTemp(node: ESIToken): string {
	let depth = 0
	let current: ESIToken | undefined = node.parent
	while (current) {
		if (current.type === 'SelectStatement') depth++
		current = current.parent
	}
	return depth === 0 ? SELECT_TEMP : `${SELECT_TEMP}${depth}`
}

function equalsSelect(tmp: string, test: Expression): Expression {
	return callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('equals')), [
		identifier(tmp),
		test,
	])
}

function ppCaseStatement(node: ESIToken): unknown {
	const exprs = node.children[0].estree as Expression[]
	const block = findChildBlock(node) ?? blockStatement([])
	return { tests: exprs, block } as CaseBranch
}

function ppCaseClauses(node: ESIToken): unknown {
	return collectChildren(node, 'CaseClause')
}

function ppCaseElseStatement(node: ESIToken): unknown {
	return findChildBlock(node) ?? blockStatement([])
}
