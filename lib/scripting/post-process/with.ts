// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BlockStatement } from 'estree'
import { identifier, memberExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** Transforms `With` blocks into explicit member expressions. */
export function ppWith(node: ESIToken): unknown {
	if (node.type === 'WithStatement') return ppWithStatement(node as ESIToken)
	return null
}

function ppWithStatement(node: ESIToken): unknown {
	let estree: unknown[] = []
	const expr = (node.children[0] as any).estree
	for (const child of node.children) {
		if (child.type !== 'Block') continue
		const block = replace((child as any).estree, {
			leave: (blockNode: any) => {
				if (blockNode.type === 'Identifier' && blockNode.name.startsWith('.')) {
					return memberExpression(expr, identifier(blockNode.name.substring(1)))
				}
			},
		})
		estree = (block as BlockStatement).body as unknown[]
	}
	return estree
}
