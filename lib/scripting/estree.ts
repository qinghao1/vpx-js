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

/** Create a `Program` node. */
export function program(data: Statement[]): Program {
	return {
		type: 'Program',
		sourceType: 'script',
		body: data,
	}
}

/** Create an `Identifier` node. */
export function identifier(name: string, node?: BaseNode): Identifier {
	return addScope(
		{
			type: 'Identifier',
			name,
		},
		node,
	)
}

/** Create a `Literal` node. */
export function literal(value: string | boolean | number | null, raw?: string | undefined, node?: BaseNode): Literal {
	return addScope(
		{
			type: 'Literal',
			value,
			raw,
		},
		node,
	)
}

/** Create a `ClassBody` node. */
export function classBody(body: MethodDefinition[]): ClassBody {
	return {
		type: 'ClassBody',
		body,
	}
}

/** Create a `VariableDeclarator` node. */
export function variableDeclarator(id: Identifier, init: Expression | null): VariableDeclarator {
	return {
		type: 'VariableDeclarator',
		id,
		init,
	}
}

/** Create a `ClassDeclaration` node. */
export function classDeclaration(id: Identifier, body: ClassBody): ClassDeclaration {
	return {
		type: 'ClassDeclaration',
		id,
		body,
	}
}

/** Create a `ClassExpression` node. */
export function classExpression(body: ClassBody, node?: BaseNode): ClassExpression {
	return addScope(
		{
			type: 'ClassExpression',
			body,
		},
		node,
	)
}

/** Create a `FunctionDeclaration` node. */
export function functionDeclaration(id: Identifier, params: Identifier[], body: BlockStatement): FunctionDeclaration {
	return {
		type: 'FunctionDeclaration',
		id,
		generator: false,
		params,
		body,
	}
}

/** Create a `VariableDeclaration` node. */
export function variableDeclaration(
	kind: 'var' | 'let' | 'const',
	declarations: VariableDeclarator[],
): VariableDeclaration {
	return {
		type: 'VariableDeclaration',
		kind,
		declarations,
	}
}

/** Create a `MethodDefinition` node. */
export function methodDefinition(
	key: Expression,
	kind: 'constructor' | 'method' | 'get' | 'set',
	value: FunctionExpression,
): MethodDefinition {
	return {
		type: 'MethodDefinition',
		key,
		kind,
		value,
		static: false,
		computed: false,
	}
}

/** Create an `ArrayExpression` node. */
export function arrayExpression(elements: Expression[] | SpreadElement[]): ArrayExpression {
	return {
		type: 'ArrayExpression',
		elements,
	}
}

/** Create an `ArrowFunctionExpression` node. */
export function arrowFunctionExpression(
	expression: boolean,
	body: BlockStatement | Expression,
	params: Pattern[] = [],
): ArrowFunctionExpression {
	return {
		type: 'ArrowFunctionExpression',
		expression,
		body,
		params,
	}
}

/** Create an `AssignmentExpression` node. */
export function assignmentExpression(
	left: Pattern | MemberExpression,
	operator: AssignmentOperator,
	right: Expression,
	node?: BaseNode,
): AssignmentExpression {
	return addScope(
		{
			type: 'AssignmentExpression',
			left,
			operator,
			right,
		},
		node,
	)
}

/** Create a `BinaryExpression` node. */
export function binaryExpression(operator: BinaryOperator, left: Expression, right: Expression): BinaryExpression {
	return {
		type: 'BinaryExpression',
		operator,
		left,
		right,
	}
}

/** Create a `CallExpression` node. */
export function callExpression(callee: Expression, args: Expression[] | SpreadElement[]): CallExpression {
	return {
		type: 'CallExpression',
		callee,
		arguments: args,
		optional: false,
	} as CallExpression
}

/** Create a `ConditionalExpression` node. */
export function conditionalExpression(
	test: Expression,
	consequent: Expression,
	alternate: Expression,
): ConditionalExpression {
	return {
		type: 'ConditionalExpression',
		test,
		alternate,
		consequent,
	}
}

/** Create a `FunctionExpression` node. */
export function functionExpression(body: BlockStatement, params: Pattern[], node?: BaseNode): FunctionExpression {
	return addScope(
		{
			type: 'FunctionExpression',
			body,
			params,
		},
		node,
	)
}

/** Create a `LogicalExpression` node. */
export function logicalExpression(operator: LogicalOperator, left: Expression, right: Expression): LogicalExpression {
	return {
		type: 'LogicalExpression',
		operator,
		left,
		right,
	}
}

/** Create a `MemberExpression` node. */
export function memberExpression(
	object: Expression | Super,
	prop: Expression,
	computed = false,
	node?: BaseNode,
): MemberExpression {
	return addScope(
		{
			type: 'MemberExpression',
			object,
			property: prop,
			computed,
			optional: false,
		},
		node,
	) as MemberExpression
}

/** Create an `ObjectExpression` node. */
export function objectExpression(properties: Property[]): ObjectExpression {
	return {
		type: 'ObjectExpression',
		properties,
	}
}

/** Create a `Property` node. */
export function property(kind: 'init' | 'get' | 'set', key: Expression, value: Expression | Pattern): Property {
	return {
		type: 'Property',
		kind,
		key,
		value,
		method: false,
		shorthand: false,
		computed: false,
	}
}

/** Create a `NewExpression` node. */
export function newExpression(callee: Expression | Super, args: Expression[] | SpreadElement[]): NewExpression {
	return {
		type: 'NewExpression',
		callee,
		arguments: args,
	}
}

/** Create a `ThisExpression` node. */
export function thisExpression(): ThisExpression {
	return {
		type: 'ThisExpression',
	}
}

/** Create a `UnaryExpression` node. */
export function unaryExpression(operator: UnaryOperator, argument: Expression): UnaryExpression {
	return {
		type: 'UnaryExpression',
		operator,
		prefix: true,
		argument,
	}
}

/** Create a `BlockStatement` node. */
export function blockStatement(body: Statement[]): BlockStatement {
	return {
		type: 'BlockStatement',
		body,
	}
}

/** Create a `BreakStatement` node. */
export function breakStatement(): BreakStatement {
	return {
		type: 'BreakStatement',
	}
}

/** doWhileStatement. */
export function doWhileStatement(body: Statement, test: Expression): DoWhileStatement {
	return {
		type: 'DoWhileStatement',
		body,
		test,
	}
}

/** Create an `ExpressionStatement` node. */
export function expressionStatement(expression: Expression, node?: BaseNode): ExpressionStatement {
	return addScope(
		{
			type: 'ExpressionStatement',
			expression,
		},
		node,
	)
}

/** forOfStatement. */
export function forOfStatement(
	left: VariableDeclaration | Pattern,
	right: Expression,
	body: Statement,
): ForOfStatement {
	return {
		type: 'ForOfStatement',
		left,
		right,
		body,
		await: false,
	} as ForOfStatement
}

/** Create a `ForStatement` node. */
export function forStatement(
	init: Expression | null,
	test: Expression | null,
	update: Expression | null,
	body: Statement,
): ForStatement {
	return {
		type: 'ForStatement',
		init,
		test,
		update,
		body,
	}
}

/** Create an `IfStatement` node. */
export function ifStatement(test: Expression, consequent: Statement, alternate: Statement | null): IfStatement {
	return {
		type: 'IfStatement',
		test,
		consequent,
		alternate,
	}
}

/** Create a `ReturnStatement` node. */
export function returnStatement(argument: Expression | null): ReturnStatement {
	return {
		type: 'ReturnStatement',
		argument,
	}
}

/** Create a `SwitchStatement` node. */
export function switchStatement(discriminant: Expression, cases: SwitchCase[]): SwitchStatement {
	return {
		type: 'SwitchStatement',
		discriminant,
		cases,
	}
}

/** switchCase. */
export function switchCase(test: Expression | null, consequent: Statement[]): SwitchCase {
	return {
		type: 'SwitchCase',
		test,
		consequent,
	}
}

/** Create a `WhileStatement` node. */
export function whileStatement(test: Expression, body: Statement): WhileStatement {
	return {
		type: 'WhileStatement',
		test,
		body,
	}
}

function addScope<T>(toNode: T, fromNode: any): T {
	if (fromNode && fromNode.__scope) {
		;(toNode as any).__scope = fromNode.__scope
	}
	return toNode
}
