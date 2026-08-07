// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { blockStatement, breakStatement, ifStatement, switchCase, switchStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

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
	let block: any = null
	let alternate: any = null
	for (const child of node.children) {
		if (child.type === 'Block') block = child.estree
		else if (['ElseIfStatement', 'ElseIfStatementInline', 'ElseStatement'].includes(child.type)) {
			if (alternate === null) alternate = child.estree
			else {
				let tmp = alternate
				while (tmp.alternate !== null) tmp = tmp.alternate
				tmp.alternate = child.estree
			}
		}
	}
	return ifStatement(expr, block ? block : blockStatement([]), alternate)
}

function ppElseIfStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	let block: any = null
	for (const child of node.children) {
		if (child.type === 'Block') block = child.estree
		else if (child.type === 'StatementsInline') block = blockStatement(child.estree)
	}
	return ifStatement(expr, block ? block : blockStatement([]), null)
}

function ppElseStatement(node: ESIToken): unknown {
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = child.estree
	return block ? block : blockStatement([])
}

function ppLineIfThenStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	const stmts = node.children[1].estree
	const elseStmts = node.children.length > 2 ? node.children[2].estree : null
	return ifStatement(expr, blockStatement(stmts), elseStmts ? blockStatement(elseStmts) : null)
}

function ppSelectStatement(node: ESIToken): unknown {
	const expr = node.children[0].estree
	const cases: unknown[] = []
	for (const child of node.children) {
		if (child.type === 'CaseStatement') cases.push(...(child.estree as unknown[]))
		else if (child.type === 'CaseElseStatement') cases.push(child.estree)
	}
	return switchStatement(expr, cases as any)
}

function ppCaseStatement(node: ESIToken): unknown {
	const estree: any[] = []
	const exprs = node.children[0].estree
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = child.estree
	for (let i = 0; i < exprs.length; i++) {
		if (i < exprs.length - 1) estree.push(switchCase(exprs[i], []))
		else {
			if (block === null) block = blockStatement([])
			block.body.push(breakStatement())
			estree.push(switchCase(exprs[i], block.body))
		}
	}
	return estree
}

function ppCaseClauses(node: ESIToken): unknown {
	const estree: unknown[] = []
	for (const child of node.children) if (child.type === 'CaseClause') estree.push(child.estree)
	return estree
}

function ppCaseElseStatement(node: ESIToken): unknown {
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = child.estree
	return switchCase(null, block ? block.body : [])
}
