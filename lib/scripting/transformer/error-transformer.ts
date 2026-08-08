// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { Program } from 'estree'
import { identifier, memberExpression } from '../estree.js'
import { Transformer } from './transformer.js'

/** Transforms On Error. */
export class ErrorTransformer extends Transformer {
	public transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				if (
					node.type === 'Identifier' &&
					node.name === 'Err' &&
					parent &&
					(parent.type === 'IfStatement' || parent.type === 'LogicalExpression')
				) {
					return memberExpression(node, identifier('Number'))
				}
			},
		}) as Program
	}
}
