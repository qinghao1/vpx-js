// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { CallExpression, Expression, Identifier, MemberExpression, Program } from 'estree'
import type { EnumsApi } from '../../vpt/enums.js'
import type { GlobalApi } from '../../vpt/global-api.js'
import { arrayExpression, callExpression, identifier, literal, memberExpression } from '../estree.js'
import type { Stdlib } from '../stdlib/index.js'
import { Transformer } from './transformer.js'

/**
 * This transformer handles two cases where VBScript's syntax is ambiguous
 * without context.
 *
 * 1. Call expressions that potentially are array accessors
 *
 *   In VBScript you can't tell if `someIdentifier(1)` is a function call with
 *   parameter `1` or access to the 2nd element of the `someIdentifier` array.
 *
 *   Such calls are replaced with a function call that determines this at
 *   runtime.
 *
 * 2. Property accessors that potentially are function calls
 *
 *   If a sub of an object has no parameters in VBScript, it's not clear at
 *   compile time if it's a sub or a property. For example, `foo.Bar` could be
 *   an access to `foo`'s `Bar` property or a call to its `Bar` sub.
 *
 *   Such accessors are replaced with a function call that determines this at
 *   runtime.
 *
 * Both cases resolve in a single traversal: a `CallExpression` is entered
 * before its callee, so the call case marks the callee first and the property
 * case then sees the same flags a second pass would.
 */
/** Resolves VBScript call vs array ambiguity. */
export class AmbiguityTransformer extends Transformer {
	private readonly enumApis: EnumsApi
	private readonly itemApis: Record<string, unknown>
	private readonly globalApi: GlobalApi
	private readonly stdlib: Stdlib

	constructor(
		ast: Program,
		itemApis: Record<string, unknown>,
		enumApis: EnumsApi,
		globalApi: GlobalApi,
		stdlib: Stdlib,
	) {
		super(ast)
		this.itemApis = itemApis
		this.enumApis = enumApis
		this.globalApi = globalApi
		this.stdlib = stdlib
	}

	public transform(): Program {
		return replace(this.ast, {
			enter: (node, parent: any) => {
				if (node.type === 'AssignmentExpression') {
					return this.transformSetAssignment(node, parent) ?? node
				}
				if (node.type === 'CallExpression') {
					return this.transformCallExpression(node, parent)
				}
				if (node.type === 'MemberExpression') {
					return this.transformMemberExpression(node, parent)
				}
				return node
			},
		}) as Program
	}

	/**
	 * Rewrites a parameterized call on an assignment LHS (`X(a) = v`) to a
	 * runtime-dispatched `setOrCall`: a function member is a parameterized
	 * `Property Let` and runs with the value appended, anything else
	 * index-stores. Bare-name callees keep the plain index-store form below.
	 */
	private transformSetAssignment(node: any, _parent: any): Expression | undefined {
		const left = node?.left
		if (!left || left.type !== 'CallExpression') return undefined
		const callee = left.callee
		if (!callee || callee.type !== 'MemberExpression') return undefined
		if (callee.property?.type !== 'Identifier' || callee.computed) return undefined
		if (!Array.isArray(left.arguments) || left.arguments.length < 1) return undefined
		return callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('setOrCall')), [
			callee.object as Expression,
			literal(callee.property.name),
			arrayExpression(left.arguments as Expression[]),
			node.right as Expression,
		])
	}

	/** Whether a name is a known namespace object (`__items`, `__enums`, ...) rather than a VBS value. */
	private isNamespaced(name: string): boolean {
		return (
			name === Transformer.ITEMS_NAME ||
			name === Transformer.ENUMS_NAME ||
			name === Transformer.GLOBAL_NAME ||
			name === Transformer.STDLIB_NAME ||
			name === Transformer.VBSHELPER_NAME ||
			name === Transformer.PLAYER_NAME
		)
	}

	private transformCallExpression(node: CallExpression, parent: any): Expression {
		if (node.callee.type === 'Identifier' && node.callee.name.toLowerCase() === 'eval') {
			return node
		}

		// if it's an assignment where its left is the node, it's definitely not a function call
		if (parent && parent.type === 'AssignmentExpression' && node === parent.left) {
			let arrayNode: (MemberExpression & { __isProperty?: boolean }) | null = null
			for (const argument of node.arguments) {
				arrayNode = memberExpression(
					arrayNode !== null ? arrayNode : node.callee,
					argument as Expression,
					true,
				) as any

				arrayNode.__isProperty = true // so we don't transform it below
			}
			return arrayNode as unknown as Expression
		}

		// if it's a member, then check if we exclude objects we know don't contain arrays
		if (node.callee.type === 'MemberExpression') {
			const topMemberName = this.getTopMemberName(node.callee)
			if (this.isNamespaced(topMemberName)) {
				let api: unknown
				switch (topMemberName) {
					case Transformer.GLOBAL_NAME:
						api = this.globalApi
						break
					case Transformer.ITEMS_NAME:
						api = this.itemApis
						break
					case Transformer.STDLIB_NAME:
						api = this.stdlib
						break
					case Transformer.ENUMS_NAME:
						return node
				}
				const obj = getValue(api, node.callee as MemberExpression)
				// zero-arg call on a property getter (e.g. __global.FrameIndex()) should be property, not call
				if (node.arguments.length === 0 && typeof obj !== 'function' && typeof obj !== 'undefined') {
					return node.callee as unknown as Expression
				}
				// A parameterized call needs something callable: a direct call on
				// a non-function value (a collection's default member `Coll(i)`,
				// an array, ...) throws at runtime. Fall through to the
				// dispatcher, which invokes functions and index-traverses the rest.
				if (node.arguments.length === 0 || typeof obj === 'function' || typeof obj === 'undefined') {
					return node
				}
			}
		}
		// otherwise, we don't know, so use getOrCall
		;(node.callee as unknown as { __isProperty?: boolean }).__isProperty = true // need to eval that on runtime, not compile time
		return getOrCall(node.callee as Expression, ...(node.arguments as Expression[]))
	}

	private transformMemberExpression(node: MemberExpression, parent: any): Expression {
		// if it's already a call, ignore
		if (parent && parent.type === 'CallExpression' && parent.callee === node) {
			return node
		}

		// if it's an assignment where its left is the node, it's definitely not a function call
		if (parent && ['AssignmentExpression', 'ForOfStatement'].includes(parent.type) && node === parent.left) {
			return node
		}

		// if we previously determined that this isn't a function, return.
		if ((parent as unknown as { __isProperty?: boolean }).__isProperty) {
			return node
		}

		// if it's a variable declaration, ignore
		if (parent && parent.type === 'VariableDeclaration') {
			return node
		}

		// if it's a class instantiation, ignore
		if (parent && parent.type === 'NewExpression') {
			return node
		}

		// if it's within a redim call, ignore
		if (
			parent &&
			parent.type === 'CallExpression' &&
			parent.callee.type === 'MemberExpression' &&
			parent.callee.object.type === 'Identifier' &&
			parent.callee.object.name === Transformer.VBSHELPER_NAME &&
			parent.callee.property.type === 'Identifier' &&
			parent.callee.property.name === 'redim'
		) {
			return node
		}

		// now, if it's a prop of something we already know, check if it's a function.
		const topMemberName = this.getTopMemberName(node)
		let api: unknown
		switch (topMemberName) {
			case Transformer.GLOBAL_NAME:
				api = this.globalApi
				break
			case Transformer.ITEMS_NAME:
				api = this.itemApis
				break
			case Transformer.STDLIB_NAME:
				api = this.stdlib
				break
			case Transformer.ENUMS_NAME: // enums ain't no functions either
				return node
		}

		const obj = getValue(api, node)
		// if it's a function, render it as such
		if (typeof obj === 'function' && (node as unknown as { __isProperty?: boolean }).__isProperty !== true) {
			return callExpression(node, [])
		}
		// otherwise, if we got something, that means it's a property
		if (typeof obj !== 'undefined') {
			return node
		}

		// already replaced?
		if (
			parent &&
			parent.type === 'CallExpression' &&
			parent.callee.type === 'MemberExpression' &&
			parent.callee.object.name === Transformer.VBSHELPER_NAME &&
			parent.callee.property.type === 'Identifier' &&
			(parent.callee.property.name === 'getOrCall' || parent.callee.property.name === 'getOrCallBound')
		) {
			return node
		}

		// A bare scope variable feeding `Is` compares the reference itself, so
		// read it without invoking: a function held by the variable (e.g. the
		// `Set cb = ...` / `If Not cb Is Nothing Then cb bstate` solenoid
		// dispatch in core.vbs) would otherwise fire with no arguments, yield
		// undefined, and skip the guarded call.
		if (isIsOperand(node, parent)) {
			return getRef(node)
		}

		// otherwise we don't know. so eval runtime
		return getOrCall(node)
	}
}

/**
 * Reads the value from an object where an AST points to.
 * @param obj Object
 * @param ast AST
 * @param path Recursively populated path
 */
function getValue(obj: unknown, ast: MemberExpression, path: string[] = []): unknown {
	if (typeof obj === 'undefined') {
		return undefined
	}
	if (ast.property.type !== 'Identifier') {
		return undefined
	}
	if (ast.object.type === 'MemberExpression') {
		return getValue(obj, ast.object, [ast.property.name, ...path])
	}
	if (ast.object.type === 'Identifier') {
		let o: any = obj
		path = [ast.property.name, ...path]
		for (const name of path) {
			if (!o) {
				return undefined
			}
			o = o[name]
		}
		return o
	}
	return undefined
}

/**
 * Whether a member read is a direct operand of an `__vbs.is(...)` check.
 * Only bare scope-variable reads (`__scope.name`) qualify: member reads on
 * other objects are property accesses (whose getters must run), and reads
 * with call arguments are real calls — both keep the invoking form.
 */
function isIsOperand(node: MemberExpression, parent: any): boolean {
	if (parent?.type !== 'CallExpression' || parent.callee === node) return false
	const callee = parent.callee as MemberExpression
	if (callee?.type !== 'MemberExpression') return false
	const helper = callee.object as Identifier
	const method = callee.property as Identifier
	if (helper?.type !== 'Identifier' || helper.name !== Transformer.VBSHELPER_NAME) return false
	if (method?.type !== 'Identifier' || method.name !== 'is') return false
	const obj = node.object as Identifier
	const prop = node.property as Identifier
	return (
		obj?.type === 'Identifier' &&
		obj.name === Transformer.SCOPE_NAME &&
		prop?.type === 'Identifier' &&
		!node.computed
	)
}

/**
 * Creates a callExpression to the non-invoking "getRef" vbs-helper
 * (see `VbsHelper.getRef`). Twin of {@link getOrCall} for reference positions.
 * @param callee Object
 */
function getRef(callee: MemberExpression): CallExpression {
	if (callee.property.type === 'Identifier') {
		return callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('getRef')), [
			callee.object as Expression,
			literal(callee.property.name),
		])
	}
	return getOrCall(callee)
}

/**
 * Creates a callExpression to the "getOrCall" vbs-helper.
 * @param callee Object
 * @param args Arguments
 */
function getOrCall(callee: Expression, ...args: Expression[]): CallExpression {
	if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
		return callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('getOrCallBound')), [
			callee.object as Expression,
			literal(callee.property.name),
			...args,
		])
	} else {
		return callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('getOrCall')), [
			callee,
			...args,
		])
	}
}
