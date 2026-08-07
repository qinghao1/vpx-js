// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BlockStatement } from 'estree'
import { identifier, memberExpression } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

export function ppWith(node: ESIToken): any {
	switch (node.type) {
		case 'WithStatement':
			return ppWithStatement(node)
	}
	return null
}

function ppWithStatement(node: ESIToken): any {
	let estree: any = []
	const expr = node.children[0].estree
	for (const child of node.children) {
		if (child.type === 'Block') {
			const block = replace(child.estree, {
				leave: (blockNode) => {
					if (blockNode.type === 'Identifier') {
						if (blockNode.name.startsWith('.')) {
							return memberExpression(expr, identifier(blockNode.name.substr(1)))
						}
					}
				},
			})
			estree = (block as BlockStatement).body
		}
	}
	return estree
}
