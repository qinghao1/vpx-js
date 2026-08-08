// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { MethodDefinition, Program, ReturnStatement } from 'estree'
import {
	arrowFunctionExpression,
	callExpression,
	identifier,
	memberExpression,
	newExpression,
	objectExpression,
	property,
	returnStatement,
	thisExpression,
} from '../estree.js'
import { Transformer } from './transformer.js'

/** Injects VBS class proxy. */
export class ClassTransformer extends Transformer {
	constructor(ast: Program) {
		super(ast)
	}

	public transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				// inject proxy into constructor
				if (node.type === 'ClassBody') {
					const ctr = node.body.find((m: any) => (m as any).kind === 'constructor') as MethodDefinition
					ctr.value.body.body.push(proxyReturnStatement())
				}

				// make method declarations lower case
				if (node.type === 'Identifier' && parent && parent.type === 'MethodDefinition') {
					return identifier(node.name.toLowerCase())
				}
			},
		}) as Program
	}

	public transformThisIdentifiers(): Program {
		let classDepth = 0
		return replace(this.ast, {
			enter: (node: any, parent: any) => {
				if (node.type === 'ClassDeclaration' || node.type === 'ClassBody' || node.type === 'ClassExpression') {
					classDepth++
				}
				// make member usages lower case only inside VBS classes
				if (
					classDepth > 0 &&
					node.type === 'ThisExpression' &&
					parent &&
					parent.type === 'MemberExpression' &&
					parent.property.type === 'Identifier'
				) {
					parent.property.name = parent.property.name.toLowerCase()
				}
			},
			leave: (node: any) => {
				if (node.type === 'ClassDeclaration' || node.type === 'ClassBody' || node.type === 'ClassExpression') {
					classDepth--
				}
			},
		}) as Program
	}
}

function proxyReturnStatement(): ReturnStatement {
	return returnStatement(
		newExpression(identifier('Proxy'), [
			thisExpression(),
			objectExpression([
				property(
					'init',
					identifier('get'),
					arrowFunctionExpression(
						true,
						callExpression(memberExpression(identifier('Reflect'), identifier('get')), [
							identifier('t'),
							callExpression(memberExpression(identifier('p'), identifier('toLowerCase')), []),
							identifier('r'),
						]),
						[identifier('t'), identifier('p'), identifier('r')],
					),
				),
				property(
					'init',
					identifier('set'),
					arrowFunctionExpression(
						true,
						callExpression(memberExpression(identifier('Reflect'), identifier('set')), [
							identifier('t'),
							callExpression(memberExpression(identifier('p'), identifier('toLowerCase')), []),
							identifier('v'),
							identifier('r'),
						]),
						[identifier('t'), identifier('p'), identifier('v'), identifier('r')],
					),
				),
				property(
					'init',
					identifier('has'),
					arrowFunctionExpression(
						true,
						callExpression(memberExpression(identifier('Reflect'), identifier('has')), [
							identifier('t'),
							callExpression(memberExpression(identifier('p'), identifier('toLowerCase')), []),
						]),
						[identifier('t'), identifier('p')],
					),
				),
			]),
		]),
	)
}
