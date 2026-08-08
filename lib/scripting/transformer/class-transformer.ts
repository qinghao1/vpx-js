// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { replace } from 'estraverse'
import type { Expression, MethodDefinition, Program, ReturnStatement } from 'estree'
import {
	arrowFunctionExpression,
	binaryExpression,
	callExpression,
	conditionalExpression,
	identifier,
	literal,
	memberExpression,
	newExpression,
	objectExpression,
	property,
	returnStatement,
	thisExpression,
	unaryExpression,
} from '../estree.js'
import { Transformer } from './transformer.js'

// VBS is case-insensitive; guard Symbol keys (engine probes Symbol.iterator) before toLowerCase
export class ClassTransformer extends Transformer {
	transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				if (node.type === 'ClassBody') {
					const ctr = node.body.find((m: any) => m.kind === 'constructor') as MethodDefinition | undefined
					if (!ctr) return
					ctr.value.body.body.push(proxyReturn())
				}
				if (node.type === 'Identifier' && parent?.type === 'MethodDefinition') {
					return identifier(node.name.toLowerCase())
				}
			},
		}) as Program
	}

	transformThisIdentifiers(): Program {
		let depth = 0
		return replace(this.ast, {
			enter: (node: any, parent: any) => {
				if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') depth++
				if (
					depth > 0 &&
					node.type === 'ThisExpression' &&
					parent?.type === 'MemberExpression' &&
					parent.property.type === 'Identifier'
				) {
					parent.property.name = parent.property.name.toLowerCase()
				}
			},
			leave: (node: any) => {
				if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') depth--
			},
		}) as Program
	}
}

function lower(prop: string): Expression {
	return conditionalExpression(
		binaryExpression('===', unaryExpression('typeof', identifier(prop)), literal('string')),
		callExpression(memberExpression(identifier(prop), identifier('toLowerCase')), []),
		identifier(prop),
	)
}

function proxyReturn(): ReturnStatement {
	const trap = (name: string, args: string[], exprs: Expression[]) =>
		property(
			'init',
			identifier(name),
			arrowFunctionExpression(
				true,
				callExpression(memberExpression(identifier('Reflect'), identifier(name)), exprs),
				args.map((v) => identifier(v)),
			),
		)
	return returnStatement(
		newExpression(identifier('Proxy'), [
			thisExpression(),
			objectExpression([
				trap('get', ['t', 'p', 'r'], [identifier('t'), lower('p'), identifier('r')]),
				trap('set', ['t', 'p', 'v', 'r'], [identifier('t'), lower('p'), identifier('v'), identifier('r')]),
				trap('has', ['t', 'p'], [identifier('t'), lower('p')]),
			]),
		]),
	)
}
