// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { variableDeclaration, variableDeclarator } from '../estree.js'
import type { ESIToken } from '../grammar/grammar.js'

export function ppConst(node: ESIToken): any {
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

function ppConstantMemberDeclaration(node: ESIToken): any {
	const constDecls = node.children[0].type === 'ConstantDeclarators' ? node.children[0].estree : node.children[1].estree
	return variableDeclaration('const', constDecls)
}

function ppConstantDeclarators(node: ESIToken): any {
	const estree = []
	for (const child of node.children) {
		if (child.type === 'ConstantDeclarator') {
			estree.push(child.estree)
		}
	}
	return estree
}

function ppConstantDeclarator(node: ESIToken): any {
	const id = node.children[0].estree
	const expr = node.children[2].estree
	return variableDeclarator(id, expr)
}
