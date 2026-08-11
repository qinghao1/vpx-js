// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BinaryOperator, Expression, Identifier, LogicalOperator, UnaryOperator } from 'estree'
import {
	binaryExpression,
	callExpression,
	identifier,
	logicalExpression,
	memberExpression,
	newExpression,
	unaryExpression,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** Transforms VBS expressions into ESTree. */
export function ppExpr(node: ESIToken): unknown {
	if (node.children.length > 1) {
		switch (node.type) {
			case 'LogicalOperatorExpression':
				return ppLogicalExpression(node)
			case 'RelationalOperatorExpression':
				return ppRelationalExpression(node)
			case 'AdditionOperatorExpression':
				return ppBinaryExpression(node)
			case 'ModuloOperatorExpression':
				return ppModuloExpression(node)
			case 'MultiplicationOperatorExpression':
				return ppBinaryExpression(node)
			case 'IntegerDivisionOperatorExpression':
				return ppIntegerDivisionExpression(node)
			case 'ExponentOperatorExpression':
				return ppExponentExpression(node)
			case 'ConcatenationOperatorExpression':
				return ppConcatExpression(node)
			case 'TypeExpression':
				return ppTypeExpression(node)
			case 'SubExpression':
				return ppSubExpression(node)
		}
	}
	switch (node.type) {
		case 'InvocationExpression':
			return ppInvocationExpression(node)
		case 'InvocationMemberAccessExpression':
			return ppInvocationMemberAccessExpression(node)
		case 'LogicalNotOperatorExpression':
			return ppLogicalNotExpression(node)
		case 'UnaryExpression':
			return ppUnaryExpression(node)
		case 'ParenthesizedExpression':
			return ppParenthesizedExpression(node)
		case 'MemberAccessExpression':
			return ppMemberAccessExpression(node)
		case 'NewExpression':
			return ppNewExpression(node)
		case 'ExponentOperatorExpression':
			return ppExponentExpression(node)
		case 'ConcatenationOperatorExpression':
			return ppConcatExpression(node)
		case 'TypeExpression':
			return ppTypeExpression(node)
		case 'SubExpression':
			return ppSubExpression(node)
	}
	return null
}

function ppBinaryExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		const operator = node.text.charAt(index) as BinaryOperator
		expr = binaryExpression(operator, expr, child.estree)
		index += child.text.length + 1
	}
	return expr
}

function ppIntegerDivisionExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('intDiv')), [
			expr,
			child.estree,
		])
	}
	return expr
}

/** ppModuloExpression. */
export function ppModuloExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = binaryExpression('%', expr, child.estree)
	}
	return expr
}

export function ppExponentExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('exponent')), [
			expr,
			child.estree,
		])
	}
	return expr
}

/** ppConcatExpression. */
export function ppConcatExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = binaryExpression('+', expr, child.estree)
	}
	return expr
}

const LOGICAL_OPERATORS: Record<string, string> = {
	And: '&&',
	Or: '||',
	Eqv: 'Eqv',
	Xor: 'Xor',
}

function ppLogicalExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		const text = node.text.substr(index)
		for (const key in LOGICAL_OPERATORS) {
			if (text.startsWith(` ${key} `)) {
				switch (LOGICAL_OPERATORS[key]) {
					case 'Eqv':
						expr = unaryExpression('~', binaryExpression('^', expr, child.estree))
						break
					case 'Xor':
						expr = logicalExpression(
							'||',
							logicalExpression('&&', expr, unaryExpression('!', child.estree)),
							logicalExpression('&&', unaryExpression('!', expr), child.estree),
						)
						break
					default:
						expr = logicalExpression(LOGICAL_OPERATORS[key] as LogicalOperator, expr, child.estree)
						break
				}
				index += child.text.length + key.length + 2
				break
			}
		}
	}
	return expr
}

const RELATIONAL_OPERATORS: Record<string, string> = {
	'<>': '!=',
	'><': '!=',
	'<=': '<=',
	'=<': '<=',
	'>=': '>=',
	'=>': '>=',
	'>': '>',
	'<': '<',
	'=': '==',
}

function ppRelationalExpression(node: ESIToken): Expression {
	let expr: Expression = node.children[0].estree as Expression
	let isNot = false
	while (node.children.length > 1 && (expr as any)?.type === 'UnaryExpression' && (expr as any).operator === '!') {
		isNot = !isNot
		expr = (expr as any).argument as Expression
	}
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		const text = node.text.substr(index)
		for (const key in RELATIONAL_OPERATORS) {
			if (text.startsWith(key)) {
				switch (RELATIONAL_OPERATORS[key]) {
					case '==':
					case '!=':
						expr = callExpression(
							memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('equals')),
							[expr, child.estree],
						)
						if (RELATIONAL_OPERATORS[key] === '!=') {
							expr = unaryExpression('!', expr)
						}
						break
					default:
						expr = binaryExpression(RELATIONAL_OPERATORS[key] as BinaryOperator, expr, child.estree)
						break
				}
				index += child.text.length + key.length
				break
			}
		}
	}
	if (isNot) expr = unaryExpression('!', expr)
	return expr
}

function ppTypeExpression(node: ESIToken): Expression {
	let expr: Expression = node.children[0].estree as Expression
	let isNot = false
	while (node.children.length > 1 && (expr as any)?.type === 'UnaryExpression' && (expr as any).operator === '!') {
		isNot = !isNot
		expr = (expr as any).argument as Expression
	}
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		if (node.text.substr(index).startsWith(' Is ')) {
			expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('is')), [
				expr,
				child.estree,
			])
			index += child.text.length + 4
		}
	}
	if (isNot) expr = unaryExpression('!', expr)
	return expr
}

function ppUnaryExpression(node: ESIToken): Expression {
	return unaryExpression(node.text.charAt(0) as UnaryOperator, node.children[0].estree)
}

function ppLogicalNotExpression(node: ESIToken): Expression {
	return unaryExpression('!', node.children[0].estree)
}

function ppParenthesizedExpression(node: ESIToken): unknown {
	return node.children[1].estree
}

function ppMemberAccessExpression(node: ESIToken): Identifier {
	let name = '.'
	switch (node.children[1].estree.type) {
		case 'Identifier':
			name += node.children[1].estree.name
			break
		case 'ThisExpression':
			name += 'this'
			break
	}
	return identifier(name)
}

function ppSubExpression(node: ESIToken): unknown {
	let id: Expression | null = null
	const argLists: Expression[][] = []
	let expr: unknown = null
	let args: Expression[] | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'MemberAccessExpression':
			case 'SimpleNameExpression':
				id = child.estree
				break
			case 'OpenParenthesis':
				args = []
				break
			case 'ArgumentList':
				args = child.estree
				break
			case 'CloseParenthesis':
				argLists.push(args!)
				break
			case 'SubExpression':
				expr = child.estree
				break
		}
	}
	let estree: Expression | undefined
	if (argLists.length > 0) {
		for (const argList of argLists) {
			estree = callExpression((estree ? estree : id) as Expression, argList)
		}
	} else {
		estree = id as Expression
	}
	if (expr != null) {
		let found = false
		estree = replace(expr as Expression, {
			enter: astNode => {
				if (!found) {
					if (astNode.type === 'Identifier') {
						found = true
						return memberExpression(
							estree as Expression,
							identifier((astNode as Identifier).name.substring(1)),
						)
					}
				}
			},
		}) as Expression
	}
	return estree
}

function ppInvocationExpression(node: ESIToken): Expression {
	let expr: Expression | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'SimpleNameExpression':
				expr = child.estree
				break
			case 'EmptyArgument':
				expr = callExpression(expr as Expression, [])
				break
			case 'ArgumentList':
				expr = callExpression(expr as Expression, child.estree)
				break
			case 'InvocationMemberAccessExpression':
				expr = expr ? ppPrepend(child.estree, expr) : child.estree
				break
		}
	}
	return ppReplaceDots(expr as Expression)
}

function ppInvocationMemberAccessExpression(node: ESIToken): Expression {
	let expr: Expression | undefined
	let currentExpr: Expression | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'MemberAccessExpression':
				if (currentExpr) {
					expr = ppAppend(expr, currentExpr)
				}
				currentExpr = child.estree
				break
			case 'EmptyArgument':
				currentExpr = callExpression(currentExpr as Expression, [])
				break
			case 'ArgumentList':
				currentExpr = callExpression(currentExpr as Expression, child.estree)
				break
		}
	}
	return ppAppend(expr, currentExpr as Expression)
}

function ppNewExpression(node: ESIToken): Expression {
	return newExpression(node.children[0].estree, [])
}

/** Prepends `a` to `b(1,2)` → `a.b(1,2)`. */
function ppPrepend(source: Expression, node: Expression): Expression {
	let found = false
	return replace(source, {
		leave: astNode => {
			if (!found) {
				found = true
				return memberExpression(node, astNode as Identifier)
			}
		},
	}) as Expression
}

/** Appends `c(3,4)` to `b(1,2)` → `b(1,2).c(3,4)`. */
function ppAppend(source: Expression | undefined, node: Expression): Expression {
	if (source) {
		if (node.type === 'Identifier') {
			source = memberExpression(source, node)
		} else if (node.type === 'CallExpression') {
			source = callExpression(memberExpression(source, node.callee as Expression), node.arguments as [Expression])
		}
	} else {
		source = node
	}
	return source
}

/** Strips leading dots from identifiers except the first (for `With`). */
function ppReplaceDots(source: Expression): Expression {
	let first = true
	return replace(source, {
		enter: node => {
			if (node.type === 'Identifier') {
				if (!first) {
					if ((node as Identifier).name.startsWith('.')) {
						return identifier((node as Identifier).name.substring(1))
					}
				} else {
					first = false
				}
			}
		},
	}) as Expression
}
