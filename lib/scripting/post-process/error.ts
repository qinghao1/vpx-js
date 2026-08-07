// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Expression } from 'estree'
import { callExpression, expressionStatement, identifier, literal, memberExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

export function ppError(node: ESIToken): any {
	switch (node.type) {
		case 'OnErrorStatement':
			return ppOnErrorStatement(node)
	}
	return null
}

function ppOnErrorStatement(node: ESIToken): any {
	let expr: Expression
	if (node.text.indexOf('GoTo') !== -1) {
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('onErrorGoto')), [
			literal(0),
		])
	} else {
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('onErrorResumeNext')), [])
	}
	return expressionStatement(expr)
}
