// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { variableDeclaration, variableDeclarator } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'
import { collectChildren } from './helpers.js'

/** Maps constant declarators to `const` declarations. */
export function ppConst(node: ESIToken): unknown {
	switch (node.type) {
		case 'ConstantMemberDeclaration':
		case 'ConstantMemberDeclarationInline':
			return ppConstantMemberDeclaration(node)
		case 'ConstantDeclarators':
			return ppConstantDeclarators(node)
		case 'ConstantDeclarator':
			return ppConstantDeclarator(node)
	}
	return null
}

function ppConstantMemberDeclaration(node: ESIToken): unknown {
	const constDecls =
		node.children[0].type === 'ConstantDeclarators' ? node.children[0].estree : node.children[1].estree
	return variableDeclaration('const', constDecls)
}

function ppConstantDeclarators(node: ESIToken): unknown {
	return collectChildren(node, 'ConstantDeclarator')
}

function ppConstantDeclarator(node: ESIToken): unknown {
	const id = node.children[0].estree
	const expr = node.children[2].estree
	return variableDeclarator(id, expr)
}
