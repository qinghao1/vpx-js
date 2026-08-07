// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { blockStatement, breakStatement, ifStatement, switchCase, switchStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** Transforms VBS conditional constructs into ESTree. */
export function ppConditional(node: ESIToken): unknown {
	switch (node.type) {
		case 'BlockIfStatement':
			return ppBlockIfStatement(node as ESIToken)
		case 'ElseIfStatement':
		case 'ElseIfStatementInline':
			return ppElseIfStatement(node as ESIToken)
		case 'ElseStatement':
			return ppElseStatement(node as ESIToken)
		case 'LineIfThenStatement':
			return ppLineIfThenStatement(node as ESIToken)
		case 'SelectStatement':
			return ppSelectStatement(node as ESIToken)
		case 'CaseStatement':
			return ppCaseStatement(node as ESIToken)
		case 'CaseClauses':
			return ppCaseClauses(node as ESIToken)
		case 'CaseElseStatement':
			return ppCaseElseStatement(node as ESIToken)
	}
	return null
}

function ppBlockIfStatement(node: ESIToken): unknown {
	const expr = (node.children[0] as any).estree
	let block: any = null,
		alternate: any = null
	for (const child of node.children) {
		if (child.type === 'Block') block = (child as any).estree
		else if (['ElseIfStatement', 'ElseIfStatementInline', 'ElseStatement'].includes(child.type)) {
			if (alternate === null) alternate = (child as any).estree
			else {
				let tmp = alternate
				while (tmp.alternate !== null) tmp = tmp.alternate
				tmp.alternate = (child as any).estree
			}
		}
	}
	return ifStatement(expr, block ? block : blockStatement([]), alternate)
}

function ppElseIfStatement(node: ESIToken): unknown {
	const expr = (node.children[0] as any).estree
	let block: any = null
	for (const child of node.children) {
		if (child.type === 'Block') block = (child as any).estree
		else if (child.type === 'StatementsInline') block = blockStatement((child as any).estree)
	}
	return ifStatement(expr, block ? block : blockStatement([]), null)
}

function ppElseStatement(node: ESIToken): unknown {
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = (child as any).estree
	return block ? block : blockStatement([])
}

function ppLineIfThenStatement(node: ESIToken): unknown {
	const expr = (node.children[0] as any).estree
	const stmts = (node.children[1] as any).estree
	const elseStmts = node.children.length > 2 ? (node.children[2] as any).estree : null
	return ifStatement(expr, blockStatement(stmts), elseStmts ? blockStatement(elseStmts) : null)
}

function ppSelectStatement(node: ESIToken): unknown {
	const expr = (node.children[0] as any).estree
	const cases: unknown[] = []
	for (const child of node.children) {
		if (child.type === 'CaseStatement') cases.push(...((child as any).estree as unknown[]))
		else if (child.type === 'CaseElseStatement') cases.push((child as any).estree)
	}
	return switchStatement(expr, cases as any)
}

function ppCaseStatement(node: ESIToken): unknown {
	const estree: any[] = []
	const exprs = (node.children[0] as any).estree
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = (child as any).estree
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
	for (const child of node.children) if (child.type === 'CaseClause') estree.push((child as any).estree)
	return estree
}

function ppCaseElseStatement(node: ESIToken): unknown {
	let block: any = null
	for (const child of node.children) if (child.type === 'Block') block = (child as any).estree
	return switchCase(null, block ? block.body : [])
}
