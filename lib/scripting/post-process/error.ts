// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Expression } from 'estree'
import { callExpression, expressionStatement, identifier, memberExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** ppError. */
export function ppError(node: ESIToken): unknown {
	switch (node.type) {
		case 'OnErrorStatement':
			return ppOnErrorStatement(node)
	}
	return null
}

function ppOnErrorStatement(node: ESIToken): unknown {
	let expr: Expression
	if (node.text.includes('GoTo')) {
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('onErrorGoto')), [])
	} else {
		expr = callExpression(
			memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('onErrorResumeNext')),
			[],
		)
	}
	return expressionStatement(expr)
}
