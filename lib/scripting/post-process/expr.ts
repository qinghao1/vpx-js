// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BinaryOperator, Expression, Identifier, UnaryOperator } from 'estree'
import {
	binaryExpression,
	callExpression,
	identifier,
	memberExpression,
	newExpression,
	unaryExpression,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'
import { vbsCall } from './helpers.js'

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
		// Via `__vbs` (see vbsCall): VBS `+` concatenates numeric strings
		// only when both are numeric, `-`/`*` coerce Empty to 0, and `/`
		// raises on divide-by-zero.
		if (operator === '+') {
			expr = vbsCall('add', [expr, child.estree])
		} else if (operator === '-') {
			expr = vbsCall('sub', [expr, child.estree])
		} else if (operator === '*') {
			expr = vbsCall('mul', [expr, child.estree])
		} else if (operator === '/') {
			expr = vbsCall('div', [expr, child.estree])
		} else {
			expr = binaryExpression(operator, expr, child.estree)
		}
		index += child.text.length + 1
	}
	return expr
}

function ppIntegerDivisionExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = vbsCall('intDiv', [expr, child.estree])
	}
	return expr
}

export function ppModuloExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		// VBS `Mod` banker's-rounds both operands and raises on a zero divisor.
		expr = vbsCall('mod', [expr, child.estree])
	}
	return expr
}

export function ppExponentExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = vbsCall('exponent', [expr, child.estree])
	}
	return expr
}

export function ppConcatExpression(node: ESIToken): Expression {
	if (node.children.length < 2) {
		return node.children[0].estree
	}
	// Via `__vbs.concat` (see vbsCall): `"a" & Null` is Null, not `"a"`.
	let expr = node.children[0].estree
	for (const child of node.children.slice(1)) {
		expr = vbsCall('concat', [expr, child.estree])
	}
	return expr
}

const LOGICAL_OPERATORS: Record<string, string> = {
	And: 'and',
	Or: 'or',
	Eqv: 'eqv',
	Xor: 'xor',
}

function ppLogicalExpression(node: ESIToken): Expression {
	let expr = node.children[0].estree
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		const text = node.text.substr(index)
		for (const key in LOGICAL_OPERATORS) {
			if (text.startsWith(` ${key} `)) {
				expr = vbsCall(LOGICAL_OPERATORS[key], [expr, child.estree])
				index += child.text.length + key.length + 2
				break
			}
		}
	}
	return expr
}

const RELATIONAL_OPERATORS: Record<string, string> = {
	'<>': 'notEquals',
	'><': 'notEquals',
	'<=': 'lte',
	'=<': 'lte',
	'>=': 'gte',
	'=>': 'gte',
	'>': 'gt',
	'<': 'lt',
	'=': 'equals',
}

/** Strips leading `__vbs.not(...)` calls, tracking parity so callers can re-apply once. */
function unwrapLeadingNots(first: Expression, strip: boolean): { expr: Expression; isNot: boolean } {
	let expr = first
	let isNot = false
	if (strip) {
		for (;;) {
			const inner = unwrapVbsNot(expr)
			if (inner === null) {
				break
			}
			isNot = !isNot
			expr = inner
		}
	}
	return { expr, isNot }
}

function ppRelationalExpression(node: ESIToken): Expression {
	// VBScript: Not binds to whole comparison (Not a = b → Not(a==b))
	const leading = unwrapLeadingNots(node.children[0].estree as Expression, node.children.length > 1)
	let expr = leading.expr
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		const text = node.text.substr(index)
		for (const key in RELATIONAL_OPERATORS) {
			if (text.startsWith(key)) {
				// Via `__vbs` (see vbsCall); `<>` is not `!(=)` since any
				// Null comparison yields Null instead of True.
				expr = vbsCall(RELATIONAL_OPERATORS[key], [expr, child.estree])
				index += child.text.length + key.length
				break
			}
		}
	}
	if (leading.isNot) expr = vbsNotCall(expr)
	return expr
}

function ppTypeExpression(node: ESIToken): Expression {
	// Like ppRelationalExpression: Not binds to whole Is check
	const leading = unwrapLeadingNots(node.children[0].estree as Expression, node.children.length > 1)
	let expr = leading.expr
	let index = node.children[0].text.length
	for (const child of node.children.slice(1)) {
		if (node.text.substr(index).startsWith(' Is ')) {
			expr = vbsCall('is', [expr, child.estree])
			index += child.text.length + 4
		}
	}
	if (leading.isNot) expr = vbsNotCall(expr)
	return expr
}

function ppUnaryExpression(node: ESIToken): Expression {
	const operator = node.text.charAt(0) as UnaryOperator
	const operand = node.children[0].estree as Expression
	if (
		operator === '-' &&
		(operand.type !== 'Literal' || typeof (operand as { value?: unknown }).value !== 'number')
	) {
		// VBS unary `-` coerces like the other arithmetic operators: Null
		// yields Null and Empty yields 0, where raw JS `-` would leak 0/NaN.
		// Numeric literals keep their raw form (`-2` negates exactly).
		return vbsCall('neg', [operand])
	}
	return unaryExpression(operator, operand)
}

function ppLogicalNotExpression(node: ESIToken): Expression {
	return vbsNotCall(node.children[0].estree)
}

function vbsNotCall(operand: Expression): Expression {
	return vbsCall('not', [operand])
}

/** Unwraps one `__vbs.not(...)` call, returning its operand or null. */
function unwrapVbsNot(expr: Expression): Expression | null {
	if (expr.type !== 'CallExpression') {
		return null
	}
	const callee = expr.callee
	if (
		callee.type !== 'MemberExpression' ||
		callee.object.type !== 'Identifier' ||
		callee.object.name !== Transformer.VBSHELPER_NAME ||
		callee.property.type !== 'Identifier' ||
		callee.property.name !== 'not'
	) {
		return null
	}
	return expr.arguments[0] as Expression
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
