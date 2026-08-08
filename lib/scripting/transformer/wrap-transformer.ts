// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Program, Statement } from 'estree'
import {
	arrowFunctionExpression,
	assignmentExpression,
	blockStatement,
	expressionStatement,
	identifier,
	memberExpression,
	program,
} from '../estree.js'
import { Transformer } from './transformer.js'

/**
 * This transformer wraps the program into a function that provides the
 * different name spaces as objects.
 *
 * @see ReferenceTransformer
 * @see ScopeTransformer
 */
export class WrapTransformer extends Transformer {
	public transform(mainFunctionName?: string, globalObjectName?: string): Program {
		if (!mainFunctionName) {
			return this.ast
		}
		return program([
			expressionStatement(
				assignmentExpression(
					globalObjectName
						? memberExpression(identifier(globalObjectName), identifier(mainFunctionName))
						: identifier(mainFunctionName),
					'=',
					arrowFunctionExpression(false, blockStatement(this.ast.body as Statement[]), [
						identifier(Transformer.SCOPE_NAME),
						identifier(Transformer.ITEMS_NAME),
						identifier(Transformer.ENUMS_NAME),
						identifier(Transformer.GLOBAL_NAME),
						identifier(Transformer.STDLIB_NAME),
						identifier(Transformer.VBSHELPER_NAME),
						identifier(Transformer.PLAYER_NAME),
					]),
				),
			),
		])
	}
}
