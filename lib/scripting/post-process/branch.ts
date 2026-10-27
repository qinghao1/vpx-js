// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { BreakStatement } from 'estree'
import { identifier, returnStatement } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { labelForExit } from './loop.js'

/** Maps `Exit Do/For` to labeled breaks and `Exit Sub/Function/Property` to bare returns. */
export function ppBranch(node: ESIToken): unknown {
	switch (node.type) {
		case 'ExitStatement':
		case 'ExitStatementInline':
			return ppExitStatement(node)
	}
	return null
}

function ppExitStatement(node: ESIToken): unknown {
	const kind = node.children[0].text
	// Labeled breaks: a bare `break` would target the innermost JS loop, which
	// is wrong when an `Exit Do` sits inside a `For` (or vice versa). Every
	// loop carries its kind's label (see loop.ts), so this always binds the
	// nearest enclosing loop of the matching kind.
	if (kind === 'Do') {
		return labeledBreak(labelForExit(node, 'Do'))
	}
	if (kind === 'For') {
		return labeledBreak(labelForExit(node, 'For'))
	}
	// `Exit Function`/`Exit Property` emit a bare `return`: the enclosing
	// Function/Property-Get rewrite fills in the function-name value (see
	// `ppFunctionDeclaration` / `ppPropertyGetDeclaration`), while `Exit Sub`
	// intentionally stays a bare `return;`.
	return returnStatement(null)
}

function labeledBreak(label: string): BreakStatement {
	return { type: 'BreakStatement', label: identifier(label) }
}
