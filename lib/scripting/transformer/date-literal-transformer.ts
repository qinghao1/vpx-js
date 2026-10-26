// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { Program } from 'estree'
import { identifier } from '../estree.js'
import { Transformer } from './transformer.js'

/**
 * Placeholder callee emitted for `#date#` literals (see `ppDateLiteral`).
 * A bare `Date` would be scope-wrapped (`new __scope.Date(...)`, a runtime
 * crash), while teaching the scope transformer about `Date` would steal user
 * variables named `Date`, so the literal keeps a placeholder until here.
 */
export const DATE_LITERAL_PLACEHOLDER = '__vbsDate'

/**
 * Rewrites `#date#` literal placeholders into real `Date` constructions.
 * Runs after scope-wrapping (compare `ClassTransformer`, whose late-emitted
 * `Proxy`/`Reflect` survive for the same reason).
 */
export class DateLiteralTransformer extends Transformer {
	public transform(): Program {
		return replace(this.ast, {
			enter: node => {
				if (node.type === 'NewExpression' && isDatePlaceholder(node.callee) && isDateArg(node)) {
					node.callee = identifier('Date')
				}
				return node
			},
		}) as Program
	}
}

function isDatePlaceholder(callee: unknown): boolean {
	if ((callee as { type?: string }).type === 'Identifier') {
		return (callee as { name?: string }).name === DATE_LITERAL_PLACEHOLDER
	}
	if ((callee as { type?: string }).type === 'MemberExpression') {
		const member = callee as { object?: unknown; property?: unknown }
		return (
			(member.object as { type?: string; name?: string }).type === 'Identifier' &&
			(member.object as { name?: string }).name === Transformer.SCOPE_NAME &&
			(member.property as { type?: string; name?: string }).type === 'Identifier' &&
			(member.property as { name?: string }).name === DATE_LITERAL_PLACEHOLDER
		)
	}
	return false
}

/** Date literals always carry exactly one string argument; user `New` never has args. */
function isDateArg(node: { arguments?: unknown[] }): boolean {
	return (
		node.arguments?.length === 1 &&
		(node.arguments[0] as { type?: string; value?: unknown }).type === 'Literal' &&
		typeof (node.arguments[0] as { value?: unknown }).value === 'string'
	)
}
