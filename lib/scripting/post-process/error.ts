// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Expression } from 'estree'
import { callExpression, expressionStatement, identifier, memberExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** Maps `On Error` statements to `__vbs.onErrorResumeNext` / `onErrorGoto` calls. */
export function ppError(node: ESIToken): unknown {
	switch (node.type) {
		case 'OnErrorStatement':
			return ppOnErrorStatement(node)
	}
	return null
}

function ppOnErrorStatement(node: ESIToken): unknown {
	// Match the `ErrorClause` child (`GoTo 0` vs `Resume Next`), not the whole
	// statement text: text-sniffing only worked because `format()` happens to
	// canonicalize keyword case upstream.
	const clause = node.children.find(child => child.type === 'ErrorClause')
	const name = (clause?.text.startsWith('GoTo') ?? false) ? 'onErrorGoto' : 'onErrorResumeNext'
	const expr: Expression = callExpression(
		memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier(name)),
		[],
	)
	return expressionStatement(expr)
}
