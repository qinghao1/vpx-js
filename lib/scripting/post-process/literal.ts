// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { identifier, literal, newExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** ppLiteral. */
export function ppLiteral(node: ESIToken): any {
	switch (node.type) {
		case 'BooleanLiteral':
			return ppBooleanLiteral(node)
		case 'FloatingPointLiteral':
			return ppFloatingPointLiteral(node)
		case 'IntLiteral':
			return ppIntLiteral(node)
		case 'HexLiteral':
			return ppHexLiteral(node)
		case 'OctalLiteral':
			return ppOctalLiteral(node)
		case 'StringLiteral':
			return ppStringLiteral(node)
		case 'DateLiteral':
			return ppDateLiteral(node)
		case 'NothingLiteral':
			return ppNothingLiteral(node)
		case 'EmptyLiteral':
			return ppEmptyLiteral(node)
		case 'NullLiteral':
			return ppNullLiteral(node)
	}
	return null
}

function ppBooleanLiteral(node: ESIToken): any {
	const value = node.text
	return literal(value === 'True')
}

function ppFloatingPointLiteral(node: ESIToken): any {
	const value = node.text
	return literal(parseFloat(value))
}

function ppIntLiteral(node: ESIToken): any {
	const value = node.text
	return literal(parseInt(value, 10))
}

function ppHexLiteral(node: ESIToken): any {
	let value = node.text
	value = '0x' + value.substr(2)
	return literal(parseInt(value, 16), value)
}

function ppOctalLiteral(node: ESIToken): any {
	let value = node.text
	value = '0' + value.substr(2)
	return literal(parseInt(value, 8), value)
}

function ppStringLiteral(node: ESIToken): any {
	const value = node.text.slice(1, -1).replace(/""/g, '"').replace(/\\/g, '\\\\').replace(/\t/g, '\\t')
	return literal(value)
}

function ppDateLiteral(node: ESIToken): any {
	const value = node.text.slice(1, -1)
	return newExpression(identifier('Date'), [literal(value)])
}

function ppNothingLiteral(node: ESIToken): any {
	return identifier('Nothing')
}

function ppEmptyLiteral(node: ESIToken): any {
	return identifier('Empty')
}

function ppNullLiteral(node: ESIToken): any {
	return identifier('Null')
}
