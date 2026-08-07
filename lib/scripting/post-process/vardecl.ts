// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { CallExpression, Expression } from 'estree'
import {
	arrayExpression,
	callExpression,
	identifier,
	memberExpression,
	variableDeclaration,
	variableDeclarator,
} from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { Transformer } from '../transformer/transformer.js'

/** ppVarDecl. */
export function ppVarDecl(node: ESIToken): unknown {
	switch (node.type) {
		case 'VariableMemberDeclaration':
		case 'VariableMemberDeclarationInline':
			return ppVariableMemberDeclaration(node)
		case 'VariableIdentifiers':
			return ppVariableIdentifiers(node)
		case 'VariableIdentifier':
			return ppVariableIdentifier(node)
	}
	return null
}

function ppVariableMemberDeclaration(node: ESIToken): unknown {
	const varDecls = node.children[1].estree
	return variableDeclaration('let', varDecls)
}

function ppVariableIdentifiers(node: ESIToken): unknown {
	const estree = []
	for (const child of node.children) {
		if (child.type === 'VariableIdentifier') {
			estree.push(child.estree)
		}
	}
	return estree
}

function ppVariableIdentifier(node: ESIToken): unknown {
	const id = node.children[0].estree
	let expr: CallExpression | null = null
	if (node.children.length > 1) {
		const args: Expression[] = node.children[1].estree
		expr = callExpression(memberExpression(identifier(Transformer.VBSHELPER_NAME), identifier('dim')), [
			arrayExpression(args),
		])
	}
	return variableDeclarator(id, expr)
}
