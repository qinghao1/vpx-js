// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BaseNode, Expression, ExpressionStatement, Identifier, Program, VariableDeclaration } from 'estree'
import {
	assignmentExpression,
	classExpression,
	expressionStatement,
	functionExpression,
	identifier,
	memberExpression,
} from '../estree.js'
import { findDeclaringScope, getScopeVars, Transformer } from './transformer.js'

/** Wraps root-scope vars into __scope so ExecuteGlobal persists across eval (strict-mode safe). */
export class ScopeTransformer extends Transformer {
	constructor(ast: Program) {
		super(ast, true)
	}

	public transform(): Program {
		this.addScope()
		this.replaceDeclarations()
		this.replaceUsages()
		return this.ast
	}

	private replaceDeclarations(): void {
		replace(this.ast, {
			enter: (node, parent) => {
				if (node.type === 'ClassDeclaration') {
					return this.wrapAssignment(node.id!, classExpression(node.body, node), node)
				}

				if (this.isRootScope(node)) {
					const isLoopVarDecl = parent && /^For.*Statement$/.test(parent.type)
					if (node.type === 'VariableDeclaration' && !isLoopVarDecl) {
						const decls = (node as VariableDeclaration).declarations
						const nodes = decls.map(d => {
							const name = (d.id as Identifier).name
							// A bare `Dim x` is Empty (undefined), not Null: Null
							// propagates through `&`/comparisons while Empty
							// coerces, so `null` here breaks `IsEmpty` and `= ""`.
							const init = (d.init as Expression | null) ?? identifier('undefined', node)
							return this.wrapAssignment(identifier(name, node), init, node)
						})
						return this.replaceMany(nodes, node)
					}

					if (node.type === 'FunctionDeclaration') {
						return this.wrapAssignment(node.id!, functionExpression(node.body, node.params, node), node)
					}
				}
				return node
			},
		})
	}

	private replaceUsages() {
		replace(this.ast, {
			enter: (node, parent: any) => {
				if (node.type !== 'Identifier' || node.name === 'undefined') return node
				if (Transformer.isReservedName(node.name)) return node
				if (parent?.type === 'MemberExpression' && parent.property === node) return node
				if ((parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement') && parent.label === node)
					return node
				if (this.getTopParentNode(parent)?.type === 'ThisExpression') return node

				const varScope = this.findScope(this.getVarName(node, parent), (node as any).__scope)
				if (varScope && varScope !== this.rootScope) {
					// findScope already located the nearest declaring scope, so the
					// variable is that scope's own match — no second chain walk.
					const v = getScopeVars(varScope).get(node.name.toLowerCase()) as { name: string } | undefined
					if (v && v.name !== node.name) node.name = v.name
					return node
				}
				if (!this.isKnown(node, parent) && (!varScope || varScope === this.rootScope)) {
					// Binding positions declare a name and must keep it bare; every other
					// position reads a name. A declarator id declares, but its init reads
					// (`let __vbsSelect = brpos` must scope the `brpos` read).
					if (
						parent &&
						(['FunctionDeclaration', 'FunctionExpression', 'ClassDeclaration', 'MethodDefinition'].includes(
							parent.type,
						) ||
							(parent.type === 'VariableDeclarator' && parent.id === node))
					)
						return node
					return memberExpression(identifier(Transformer.SCOPE_NAME, node), node, false, node)
				}
				return node
			},
		})
	}

	private wrapAssignment(left: Identifier, right: Expression, node?: BaseNode): ExpressionStatement {
		return expressionStatement(
			assignmentExpression(
				memberExpression(identifier(Transformer.SCOPE_NAME, node), left, false, node),
				'=',
				right,
				node,
			),
			node,
		)
	}

	private getVarName(node: any, parent: any): string {
		if (parent && parent.type === 'MemberExpression') {
			return this.getTopMemberName(parent)
		}
		return node.name
	}

	private findScope(name: string, currentScope: any): any {
		return findDeclaringScope(currentScope, name.toLowerCase())
	}
}
