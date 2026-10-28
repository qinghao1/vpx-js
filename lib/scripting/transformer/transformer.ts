// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as escope from 'escope'
import { traverse } from 'estraverse'
import type { BaseNode, Identifier, MemberExpression, Program, Statement } from 'estree'

const escopePkg = escope as unknown as {
	analyze?: (ast: unknown) => unknown
	default?: { analyze?: (ast: unknown) => unknown }
}
const analyze: (ast: any) => any = (escopePkg.analyze ?? escopePkg.default?.analyze ?? escopePkg) as (ast: any) => any

/**
 * Lowercased scope-variable index. `find` over `scope.variables` is linear,
 * and these lookups run per identifier per transformer pass, so index each
 * scope once. First declaration wins, matching `Array.find` semantics for
 * same-scope duplicates differing only by case.
 */
const scopeVarCache = new WeakMap<object, Map<string, unknown>>()

/** Variables of `scope` by lowercase name (first wins), built once per scope. */
export function getScopeVars(scope: { variables: Array<{ name: string }> }): Map<string, unknown> {
	let cached = scopeVarCache.get(scope)
	if (!cached) {
		cached = new Map<string, unknown>()
		for (const variable of scope.variables) {
			const key = variable.name.toLowerCase()
			if (!cached.has(key)) cached.set(key, variable)
		}
		scopeVarCache.set(scope, cached)
	}
	return cached
}

/** Nearest scope at or above `currentScope` declaring `lowerName`, or null. */
export function findDeclaringScope(currentScope: any, lowerName: string): any {
	for (let scope = currentScope; scope; scope = scope.upper) {
		if (getScopeVars(scope).has(lowerName)) return scope
	}
	return null
}

/** Base AST transformer with scope analysis. */
export class Transformer {
	public static SCOPE_NAME = '__scope'
	public static ITEMS_NAME = '__items'
	public static ENUMS_NAME = '__enums'
	public static GLOBAL_NAME = '__global'
	public static STDLIB_NAME = '__stdlib'
	public static VBSHELPER_NAME = '__vbs'
	public static PLAYER_NAME = '__player'

	/** Whether a name is one of the injected namespace objects (`__scope`, `__items`, ...). */
	public static isReservedName(name: string): boolean {
		return (
			name === Transformer.SCOPE_NAME ||
			name === Transformer.ITEMS_NAME ||
			name === Transformer.ENUMS_NAME ||
			name === Transformer.GLOBAL_NAME ||
			name === Transformer.STDLIB_NAME ||
			name === Transformer.VBSHELPER_NAME ||
			name === Transformer.PLAYER_NAME
		)
	}

	protected readonly ast: Program

	private readonly scopeManager: any
	protected readonly rootScope: any

	constructor(ast: Program, analyzeScope = false) {
		this.ast = ast
		if (analyzeScope) {
			this.scopeManager = analyze(ast)
			this.rootScope = this.scopeManager.acquire(ast)
		}
	}

	protected isKnown(node: BaseNode, parent: BaseNode): boolean {
		return this.normalizeKnownName(node) || this.isKnownParent(parent)
	}

	protected isKnownNode(node: BaseNode) {
		if (node.type !== 'Identifier') {
			return false
		}
		return KNOWN_NAMES.has((node as Identifier).name.toLowerCase())
	}

	/**
	 * Applies the canonical JS casing of a known runtime binding (`array`
	 * from any case to `Array`, `Eval` to `eval`). Returns whether the node
	 * names one. Split out of the `isKnownNode` predicate so the predicate
	 * stays side-effect free; both stay consulted together via `isKnown`.
	 */
	protected normalizeKnownName(node: BaseNode): boolean {
		if (!this.isKnownNode(node)) {
			return false
		}
		const low = (node as Identifier).name.toLowerCase()
		if (low === 'array') (node as Identifier).name = 'Array'
		else if (low === 'eval') (node as Identifier).name = 'eval'
		return true
	}

	protected isKnownParent(parent: BaseNode) {
		if (!parent) {
			return false
		}
		if (parent.type !== 'MemberExpression') {
			return false
		}
		return Transformer.isReservedName(this.getTopMemberName(parent as MemberExpression))
	}

	protected isLocalVariable(node: any): boolean {
		if (!node.name) {
			return false
		}
		if (!node.__scope) {
			throw new Error('No scope to check!')
		}
		return getScopeVars(node.__scope).has(node.name.toLowerCase())
	}

	/**
	 * Using `escope`, we acquire the current scope for each node and attach it
	 * to the node for later usage.
	 *
	 * This is a separate run because it's done when *leaving* the node.
	 */
	protected addScope(): void {
		/* istanbul ignore next */
		if (!this.rootScope) {
			throw new Error('Need to instantiate with analyzeScope = true when using addScope!')
		}
		let currentScope = this.rootScope

		traverse(this.ast, {
			enter: node => {
				const n = node as any
				const scope = this.scopeManager.acquire(node)

				n.__scope = currentScope
				n.__nextScope = !!scope
				currentScope = scope || currentScope
			},
			leave: node => {
				const n = node as any
				if (n.__nextScope) {
					currentScope = currentScope.upper
				}
			},
		})
	}

	protected isRootScope(node: any): boolean {
		/* istanbul ignore next */
		if (!node.__scope || !this.rootScope) {
			throw new Error('Need to instantiate with analyzeScope = true when using addScope!')
		}
		return node.__scope === this.rootScope
	}

	protected replaceMany(nodes: Statement[], node: BaseNode): Program {
		return {
			type: 'Program',
			body: nodes,
			__scope: (node as any).__scope,
		} as unknown as Program
	}

	protected getName(node: any): string {
		if (node.name) {
			return node.name
		}

		if (node.id) {
			return node.id.name
		}

		throw new Error('Neither `name` or `id` found to determine name.')
	}

	protected getTopParentNode(node: any): any {
		if (!node) {
			return null
		}
		if (node.type === 'MemberExpression') {
			return this.getTopParentNode(node.object)
		}
		return node
	}

	protected getTopMemberName(node: any): string {
		const obj = (node?.type === 'MemberExpression' ? node.object : node) as any
		if (!obj) {
			return ''
		}
		if (obj.type === 'MemberExpression') {
			return this.getTopMemberName(obj)
		}
		if (obj.type === 'Identifier') {
			return obj.name
		}
		if (obj.type === 'CallExpression' || obj.type === 'NewExpression') {
			return this.getTopMemberName(obj.callee)
		}
		if (obj.type === 'ThisExpression') {
			return 'this'
		}
		return ''
	}
}

/** `isKnownNode` literals, hoisted: allocated once instead of per identifier. */
const KNOWN_NAMES = new Set(['eval', 'constructor', 'array', Transformer.PLAYER_NAME.toLowerCase()])
