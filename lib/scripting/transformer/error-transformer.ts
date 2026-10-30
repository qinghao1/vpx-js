// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { CallExpression, Program } from 'estree'
import { identifier, memberExpression } from '../estree.js'
import { Transformer } from './transformer.js'

export class ErrorTransformer extends Transformer {
	public transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				if (node.type !== 'Identifier' || node.name !== 'Err' || !parent) {
					return
				}
				if (parent.type === 'IfStatement' || parent.type === 'LogicalExpression') {
					return memberExpression(node, identifier('Number'))
				}
				// Condition tests are wrapped in `__vbs.isTrue(...)` (see
				// `VbsHelper.isTrue`), which hides the test position one level
				// down. `isTrue` only ever wraps tests, so a bare `Err` under
				// it still reads `Err.Number`.
				if (isIsTrueCall(parent)) {
					return memberExpression(node, identifier('Number'))
				}
				// A bare `Err` object is always truthy and never `===` anything, so
				// loop tests and switch discriminants must read `Err.Number` instead.
				if (
					((parent.type === 'WhileStatement' || parent.type === 'DoWhileStatement') &&
						parent.test === node) ||
					(parent.type === 'SwitchStatement' && parent.discriminant === node)
				) {
					return memberExpression(node, identifier('Number'))
				}
			},
		}) as Program
	}
}

/** Matches the `__vbs.isTrue(...)` condition wrapper (see `vbsTest`). */
function isIsTrueCall(node: unknown): boolean {
	if (!node || (node as CallExpression).type !== 'CallExpression') {
		return false
	}
	const callee = (node as CallExpression).callee
	return (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		callee.object.name === Transformer.VBSHELPER_NAME &&
		callee.property.type === 'Identifier' &&
		callee.property.name === 'isTrue'
	)
}
