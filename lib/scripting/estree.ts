// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type {
	ArrayExpression,
	ArrowFunctionExpression,
	AssignmentExpression,
	AssignmentOperator,
	BaseNode,
	BinaryExpression,
	BinaryOperator,
	BlockStatement,
	BreakStatement,
	CallExpression,
	ClassBody,
	ClassDeclaration,
	ClassExpression,
	ConditionalExpression,
	DoWhileStatement,
	Expression,
	ExpressionStatement,
	ForOfStatement,
	ForStatement,
	FunctionDeclaration,
	FunctionExpression,
	Identifier,
	IfStatement,
	Literal,
	LogicalExpression,
	LogicalOperator,
	MemberExpression,
	MethodDefinition,
	NewExpression,
	ObjectExpression,
	Pattern,
	Program,
	Property,
	ReturnStatement,
	SpreadElement,
	Statement,
	Super,
	SwitchCase,
	SwitchStatement,
	ThisExpression,
	UnaryExpression,
	UnaryOperator,
	VariableDeclaration,
	VariableDeclarator,
	WhileStatement,
} from 'estree'

/** ESTree factories — concise helpers with optional scope forwarding. */

export const program = (body: Statement[]): Program => ({ type: 'Program', sourceType: 'script', body })

export const identifier = (name: string, node?: BaseNode): Identifier => addScope({ type: 'Identifier', name }, node)

export const literal = (value: string | boolean | number | null, raw?: string, node?: BaseNode): Literal =>
	addScope({ type: 'Literal', value, raw }, node)

export const classBody = (body: MethodDefinition[]): ClassBody => ({ type: 'ClassBody', body })

export const variableDeclarator = (id: Identifier, init: Expression | null): VariableDeclarator => ({
	type: 'VariableDeclarator',
	id,
	init,
})

export const classDeclaration = (id: Identifier, body: ClassBody): ClassDeclaration => ({
	type: 'ClassDeclaration',
	id,
	body,
})

export const classExpression = (body: ClassBody, node?: BaseNode): ClassExpression =>
	addScope({ type: 'ClassExpression', body }, node)

export const functionDeclaration = (
	id: Identifier,
	params: Identifier[],
	body: BlockStatement,
): FunctionDeclaration => ({ type: 'FunctionDeclaration', id, generator: false, params, body })

export const variableDeclaration = (
	kind: 'var' | 'let' | 'const',
	declarations: VariableDeclarator[],
): VariableDeclaration => ({ type: 'VariableDeclaration', kind, declarations })

export const methodDefinition = (
	key: Expression,
	kind: 'constructor' | 'method' | 'get' | 'set',
	value: FunctionExpression,
): MethodDefinition => ({ type: 'MethodDefinition', key, kind, value, static: false, computed: false })

export const arrayExpression = (elements: Expression[] | SpreadElement[]): ArrayExpression => ({
	type: 'ArrayExpression',
	elements,
})

export const arrowFunctionExpression = (
	expression: boolean,
	body: BlockStatement | Expression,
	params: Pattern[] = [],
): ArrowFunctionExpression => ({ type: 'ArrowFunctionExpression', expression, body, params })

export const assignmentExpression = (
	left: Pattern | MemberExpression,
	operator: AssignmentOperator,
	right: Expression,
	node?: BaseNode,
): AssignmentExpression => addScope({ type: 'AssignmentExpression', left, operator, right }, node)

export const binaryExpression = (operator: BinaryOperator, left: Expression, right: Expression): BinaryExpression => ({
	type: 'BinaryExpression',
	operator,
	left,
	right,
})

export const callExpression = (callee: Expression, args: (Expression | SpreadElement)[]): CallExpression =>
	({ type: 'CallExpression', callee, arguments: args, optional: false }) as CallExpression

export const conditionalExpression = (
	test: Expression,
	consequent: Expression,
	alternate: Expression,
): ConditionalExpression => ({ type: 'ConditionalExpression', test, alternate, consequent })

export const functionExpression = (body: BlockStatement, params: Pattern[], node?: BaseNode): FunctionExpression =>
	addScope({ type: 'FunctionExpression', body, params }, node)

export const logicalExpression = (
	operator: LogicalOperator,
	left: Expression,
	right: Expression,
): LogicalExpression => ({ type: 'LogicalExpression', operator, left, right })

export const memberExpression = (
	object: Expression | Super,
	prop: Expression,
	computed = false,
	node?: BaseNode,
): MemberExpression =>
	addScope({ type: 'MemberExpression', object, property: prop, computed, optional: false }, node) as MemberExpression

export const objectExpression = (properties: Property[]): ObjectExpression => ({
	type: 'ObjectExpression',
	properties,
})

export const property = (kind: 'init' | 'get' | 'set', key: Expression, value: Expression | Pattern): Property => ({
	type: 'Property',
	kind,
	key,
	value,
	method: false,
	shorthand: false,
	computed: false,
})

export const newExpression = (callee: Expression | Super, args: (Expression | SpreadElement)[]): NewExpression => ({
	type: 'NewExpression',
	callee,
	arguments: args,
})

export const thisExpression = (): ThisExpression => ({ type: 'ThisExpression' })

export const unaryExpression = (operator: UnaryOperator, argument: Expression): UnaryExpression => ({
	type: 'UnaryExpression',
	operator,
	prefix: true,
	argument,
})

export const blockStatement = (body: Statement[]): BlockStatement => ({ type: 'BlockStatement', body })

export const breakStatement = (): BreakStatement => ({ type: 'BreakStatement' })

export const doWhileStatement = (body: Statement, test: Expression): DoWhileStatement => ({
	type: 'DoWhileStatement',
	body,
	test,
})

export const expressionStatement = (expression: Expression, node?: BaseNode): ExpressionStatement =>
	addScope({ type: 'ExpressionStatement', expression }, node)

export const forOfStatement = (
	left: VariableDeclaration | Pattern,
	right: Expression,
	body: Statement,
): ForOfStatement => ({ type: 'ForOfStatement', left, right, body, await: false }) as ForOfStatement

export const forStatement = (
	init: Expression | null,
	test: Expression | null,
	update: Expression | null,
	body: Statement,
): ForStatement => ({ type: 'ForStatement', init, test, update, body })

export const ifStatement = (test: Expression, consequent: Statement, alternate: Statement | null): IfStatement => ({
	type: 'IfStatement',
	test,
	consequent,
	alternate,
})

export const returnStatement = (argument: Expression | null): ReturnStatement => ({
	type: 'ReturnStatement',
	argument,
})

export const switchStatement = (discriminant: Expression, cases: SwitchCase[]): SwitchStatement => ({
	type: 'SwitchStatement',
	discriminant,
	cases,
})

export const switchCase = (test: Expression | null, consequent: Statement[]): SwitchCase => ({
	type: 'SwitchCase',
	test,
	consequent,
})

export const whileStatement = (test: Expression, body: Statement): WhileStatement => ({
	type: 'WhileStatement',
	test,
	body,
})

function addScope<T extends object, U extends object & { __scope?: unknown } = any & { __scope?: unknown }>(
	to: T,
	from?: U,
): T {
	if (from && (from as any).__scope) (to as any).__scope = (from as any).__scope
	return to
}
