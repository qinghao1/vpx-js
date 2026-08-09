// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { FunctionDeclaration, Program } from 'estree'
import type { IScriptable } from '../../game/iscriptable.js'
import {
	callExpression,
	expressionStatement,
	functionExpression,
	identifier,
	literal,
	memberExpression,
} from '../estree.js'
import { Transformer } from './transformer.js'

/**
 * This transforms event subs into proper JavaScript event listeners.
 *
 * Example: `function Plunger_Init() {}` would become: `Plunger.on('Init', () => {})`.
 */
export class EventTransformer extends Transformer {
	private readonly items: { [p: string]: IScriptable<any> }
	private readonly itemMap: Map<string, { key: string; item: IScriptable<any> }>

	constructor(ast: Program, items: { [p: string]: IScriptable<any> }) {
		super(ast)
		this.items = items
		this.itemMap = new Map()
		for (const [k, v] of Object.entries(items)) this.itemMap.set(k.toLowerCase(), { key: k, item: v })
	}

	public transform(): Program {
		return replace(this.ast, {
			enter: (node, _parent: any) => {
				// must be a function
				if (node.type !== 'FunctionDeclaration') {
					return node
				}
				const functionNode = node as FunctionDeclaration

				// must have an id (duh.)
				if (!functionNode.id) {
					return node
				}

				// must have a _Event suffix
				if (!functionNode.id.name.includes('_')) {
					return node
				}

				// split on last index
				const objName = functionNode.id.name.substr(0, functionNode.id.name.lastIndexOf('_'))
				const eventName = functionNode.id.name.substr(functionNode.id.name.lastIndexOf('_') + 1)

				const entry = this.itemMap.get(objName.toLowerCase())
				if (!entry) return node

				const existingEventName = matchEventName(entry.item.getEventNames(), eventName)
				if (!existingEventName) {
					return node
				}

				return expressionStatement(
					callExpression(memberExpression(identifier(entry.key), identifier('on')), [
						literal(existingEventName),
						functionExpression(functionNode.body, functionNode.params),
					]),
				)
			},
		}) as Program
	}
}

function matchEventName(eventNames: string[], nameToMatch: string): string | undefined {
	for (const eventName of eventNames) {
		if (eventName.toLowerCase() === nameToMatch.toLowerCase()) {
			return eventName
		}
	}
}
