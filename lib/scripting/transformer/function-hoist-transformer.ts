// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Program } from 'estree'
import { Transformer } from './transformer.js'

/**
 * Since function declarations are converted to expressions, we need to declare
 * before we use them.
 *
 * This hoists all function declarations of the root body to the top.
 */
export class FunctionHoistTransformer extends Transformer {
	constructor(ast: Program) {
		super(ast)
	}

	public transform(): Program {
		const functions: any[] = []
		const others: any[] = []
		for (const node of this.ast.body) {
			if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) {
				functions.push(node)
			} else {
				others.push(node)
			}
		}
		this.ast.body = functions.concat(...others)
		return this.ast
	}
}
