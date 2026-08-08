// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { replace } from 'estraverse'
import type { BlockStatement, Identifier } from 'estree'
import {
	blockStatement,
	functionDeclaration,
	identifier,
	returnStatement,
	variableDeclaration,
	variableDeclarator,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

/** ppMethod. */
export function ppMethod(node: ESIToken): unknown {
	switch (node.type) {
		case 'SubDeclaration':
			return ppSubDeclaration(node)
		case 'FunctionDeclaration':
			return ppFunctionDeclaration(node)
		case 'ParameterList':
			return ppParameterList(node)
	}
	return null
}

function ppSubDeclaration(node: ESIToken): unknown {
	let id: Identifier = identifier('undefined')
	let params: Identifier[] = []
	let block: BlockStatement | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'SubSignature':
				id = child.estree
				for (const subChild of child.children) {
					if (subChild.type === 'ParameterList') {
						params = subChild.estree
						break
					}
				}
				break
			case 'Block':
				block = child.estree
				break
		}
	}
	return functionDeclaration(id, params, block ? block : blockStatement([]))
}

function ppFunctionDeclaration(node: ESIToken): unknown {
	let id: Identifier = identifier('undefined')
	let params: Identifier[] = []
	let block: BlockStatement | undefined
	for (const child of node.children) {
		switch (child.type) {
			case 'FunctionSignature':
				id = child.estree
				for (const subChild of child.children) {
					if (subChild.type === 'ParameterList') {
						params = subChild.estree
						break
					}
				}
				break
			case 'Block':
				block = child.estree
				break
		}
	}
	if (block) {
		block = replace(block, {
			enter: blockNode => {
				if (blockNode.type === 'ReturnStatement') {
					blockNode.argument = id
					return blockNode
				}
			},
		}) as BlockStatement
	} else {
		block = blockStatement([])
	}
	block.body.unshift(variableDeclaration('let', [variableDeclarator(id, identifier('undefined'))]))
	if (block.body[block.body.length - 1].type !== 'ReturnStatement') {
		block.body.push(returnStatement(id))
	}
	return functionDeclaration(id, params, block)
}

function ppParameterList(node: ESIToken): unknown {
	const params: Identifier[] = []
	for (const param of node.children) {
		if (param.type === 'Parameter') {
			if (param.children[0].type === 'ParameterModifier') {
				params.push(param.children[1].estree)
			} else {
				params.push(param.children[0].estree)
			}
		}
	}
	return params
}
