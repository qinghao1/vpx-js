// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { replace } from 'estraverse'
import type { MethodDefinition, Program, ReturnStatement } from 'estree'
import { arrowFunctionExpression, binaryExpression, callExpression, conditionalExpression, identifier, literal, memberExpression, newExpression, objectExpression, property, returnStatement, thisExpression, unaryExpression } from '../estree.js'
import { Transformer } from './transformer.js'

export class ClassTransformer extends Transformer {
	transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				if (node.type === 'ClassBody') {
					const ctr = node.body.find((m: any) => m.kind === 'constructor') as MethodDefinition
					ctr.value.body.body.push(proxyReturn())
				}
				if (node.type === 'Identifier' && parent?.type === 'MethodDefinition') return identifier(node.name.toLowerCase())
			},
		}) as Program
	}

	transformThisIdentifiers(): Program {
		let depth = 0
		return replace(this.ast, {
			enter: (node: any, parent: any) => {
				if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') depth++
				if (depth > 0 && node.type === 'ThisExpression' && parent?.type === 'MemberExpression' && parent.property.type === 'Identifier') parent.property.name = parent.property.name.toLowerCase()
			},
			leave: (node: any) => { if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') depth-- },
		}) as Program
	}
}

function lower(v: string) {
	return conditionalExpression(binaryExpression('===', unaryExpression('typeof', identifier(v)), literal('string')), callExpression(memberExpression(identifier(v), identifier('toLowerCase')), []), identifier(v)) as unknown as import('estree').Expression
}

function proxyReturn(): ReturnStatement {
	const trap = (n: string, a: string[], e: import('estree').Expression[]) => property('init', identifier(n), arrowFunctionExpression(true, callExpression(memberExpression(identifier('Reflect'), identifier(n)), e), a.map((v) => identifier(v))))
	return returnStatement(newExpression(identifier('Proxy'), [thisExpression(), objectExpression([trap('get', ['t', 'p', 'r'], [identifier('t'), lower('p'), identifier('r')]), trap('set', ['t', 'p', 'v', 'r'], [identifier('t'), lower('p'), identifier('v'), identifier('r')]), trap('has', ['t', 'p'], [identifier('t'), lower('p')])])]))
}
