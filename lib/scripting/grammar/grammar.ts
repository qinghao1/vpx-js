// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { createRequire } from 'node:module'
import { Grammars, type IToken, Parser } from 'ebnf'
import { generate } from 'escodegen'
import type { Program, Statement } from 'estree'
import { getTextFile } from '../../refs.node.js'
import { logger, progress } from '../../util/logger.js'
import { program } from '../estree.js'
import { ppArray } from '../post-process/array.js'
import { ppAssign } from '../post-process/assign.js'
import { ppBranch } from '../post-process/branch.js'
import { ppCall } from '../post-process/call.js'
import { ppClass } from '../post-process/class.js'
import { ppConditional } from '../post-process/conditional.js'
import { ppConst } from '../post-process/const.js'
import { ppError } from '../post-process/error.js'
import { ppExpr } from '../post-process/expr.js'
import { ppHelpers } from '../post-process/helpers.js'
import { ppLiteral } from '../post-process/literal.js'
import { ppLoop } from '../post-process/loop.js'
import { ppMethod } from '../post-process/method.js'
import { ppVarDecl } from '../post-process/vardecl.js'
import { ppWith } from '../post-process/with.js'
import { RULES } from './rules.js'

const _require = createRequire(import.meta.url)

import dashAstImport from 'dash-ast'

// dash-ast is CJS, handle both default and direct export
const dashAst: (ast: any, opts: any) => void = (dashAstImport as any)?.default ?? (dashAstImport as any)

export interface ESIToken extends IToken {
	estree: any
	parent: ESIToken
	children: ESIToken[]
}

/** VBS grammar parser. */
export class Grammar {
	private readonly GRAMMAR_KEYWORDS: string[] = [
		'And',
		'ByVal',
		'ByRef',
		'Case',
		'Call',
		'Class',
		'Const',
		'Default',
		'Dim',
		'Do',
		'Each',
		'ElseIf',
		'Else',
		'Empty',
		'End',
		'Erase',
		'Error',
		'Eqv',
		'Exit',
		'Explicit',
		'False',
		'For',
		'Function',
		'Get',
		'GoTo',
		'If',
		'In',
		'Is',
		'Let',
		'Loop',
		'Mod',
		'New',
		'Next',
		'Nothing',
		'Not',
		'Null',
		'On',
		'Option',
		'Or',
		'Preserve',
		'Private',
		'Property',
		'Public',
		'ReDim',
		'Resume',
		'Select',
		'Set',
		'Sub',
		'Then',
		'To',
		'True',
		'Until',
		'While',
		'WEnd',
		'With',
		'Xor',
	]

	private readonly GRAMMAR_IDENTIFIERS: string[] = ['Me']

	private readonly GRAMMAR_TARGET_FORMAT = 'Format'
	private readonly GRAMMAR_TARGET_PROGRAM = 'Program'

	private readonly parser: Parser
	private readonly keywordsMap: { [index: string]: string } = {}
	private readonly identifiersMap: { [index: string]: string } = {}

	private readonly postProcessors = [
		ppHelpers,
		ppLiteral,
		ppExpr,
		ppVarDecl,
		ppConst,
		ppArray,
		ppError,
		ppAssign,
		ppConditional,
		ppLoop,
		ppBranch,
		ppWith,
		ppMethod,
		ppCall,
		ppClass,
	]

	constructor() {
		/**
		 * Create a lookup table of standardized keywords
		 */
		for (const key of this.GRAMMAR_KEYWORDS) {
			this.keywordsMap[key.toLowerCase()] = key
		}

		/**
		 * Create a lookup table of standardized identifiers
		 */
		for (const key of this.GRAMMAR_IDENTIFIERS) {
			this.identifiersMap[key.toLowerCase()] = key
		}

		// toggle between real-time compilation and pre-compiled rules
		if (false) {
			const grammar = getTextFile('grammar.bnf')
			this.parser = new Parser(Grammars.Custom.getRules(grammar), {})
		} else {
			this.parser = new Parser(RULES, {})
		}
	}

	public format(script: string): string {
		let output = ''

		let hasLine: boolean = false
		let prevToken: IToken | undefined
		let separator = false

		let now = Date.now()

		progress().details('formatting')
		const ast = this.parser.getAST(`${script.trim()}\n`, this.GRAMMAR_TARGET_FORMAT)
		if (ast === null) {
			throw new Error('Unable to format script.')
		} else if (ast.rest?.length) {
			const start = script.length - ast.rest.length
			throw new Error(`Unable to format script. Syntax error at: ${script.substr(start, script.indexOf('\n', start))}`)
		}
		logger().info('[Grammar.format] Parsed in %sms', Date.now() - now)

		/**
		 * Reformat the script by parsing into logical lines and tokens.
		 * This will remove comments and REM statements, case correct keywords,
		 * join lines that use line continuation (_), and remove all unnecessary
		 * whitespace. Removing whitespace significantly improves performance.
		 * Rules for including whitespace are commented inline below.
		 */

		now = Date.now()
		progress().details('standardizing')

		const keywordsMap = this.keywordsMap
		const identifiersMap = this.identifiersMap

		dashAst(ast, {
			enter(node: IToken, _parent: IToken) {
				switch (node.type) {
					case 'LogicalLine':
						hasLine = false
						prevToken = undefined
						separator = false
						break
				}
			},
			leave(node: IToken, _parent: IToken) {
				switch (node.type) {
					case 'LogicalLine':
						if (hasLine) {
							output += '\n'
						}
						break
					case 'LogicalLineElement':
						if (node.text === ' ') {
							separator = true
						}
						break
					case 'Identifier':
						/**
						 * Standardize Me identifier when it isn't after a dot
						 */
						if (prevToken?.text !== '.') {
							if (identifiersMap[node.text.toLowerCase()]) {
								node.text = identifiersMap[node.text.toLowerCase()]
							}
						}
						break
					case 'Keyword':
						/**
						 * Standardize keywords
						 */
						node.text = keywordsMap[node.text.toLowerCase()]
						break
					case 'Token': {
						const token = node.children[0]
						if (prevToken) {
							switch (token.type) {
								case 'Keyword':
									/**
									 * Add spaces for the following:
									 * 1) Keyword Keyword - End Sub
									 * 2) Identifier Keyword - For j=x To 20
									 * 3) Literal Keyword - For j=1 To 20
									 * 4) ) Keyword - Function MyFunction(value) End Function
									 */
									if (
										prevToken.type === 'Keyword' ||
										prevToken.type === 'Identifier' ||
										prevToken.type === 'Literal' ||
										prevToken.text === ')'
									) {
										output += ' '
									}
									break
								case 'Identifier':
									/**
									 * Add spaces for the following:
									 * 1) Keyword Identifier - Sub BallRelease()
									 * 2) Identifier Identifier - PlaySound SoundFX("fx_flipperup", ...
									 * 3) ) Identifier - Sub BallRelease_Hit() BallRelease.CreateBall
									 * 4) Literal Identifier - For j=1 To 20 step x
									 */
									if (
										prevToken.type === 'Keyword' ||
										prevToken.type === 'Identifier' ||
										prevToken.type === 'Literal' ||
										prevToken.text === ')'
									) {
										output += ' '
									}
									break
								case 'Literal':
									/**
									 * Add spaces for the following:
									 * 1) Keyword Literal - For j=1 To 20
									 * 2) Identifier Literal - BallRelease 5, -2
									 */
									if (prevToken.type === 'Keyword' || prevToken.type === 'Identifier') {
										output += ' '
									}
									break
								default:
									switch (token.text) {
										case '(':
										case '-':
											/**
											 * Add spaces for the following:
											 * 1) Keyword '(' - For ii=(oldSize*2)+1 To(newSize*2):mSlot(ii)=0:Next
											 * 2) Keyword '-' - For ii=UBound(mSlot) To 0 Step -1:str=str&mSlot(ii):Next
											 */
											if (prevToken.type === 'Keyword') {
												output += ' '
											}
											break
										case '.':
											/**
											 * Add space for the following:
											 * 1) <Space>. - case keyReset .Stop
											 * Do not add a space for the following:
											 * 1) :<Space>. - Case keyDown swCopy=swDown: .Switch(swCopy)=False
											 * 2) =<Space>. - If .Exists(aBall) Then .Item(aBall)=.Item(aBall)+1
											 * 3) +<Space>. - dips(0)=.Dip(0)+.Dip(1)*256+ .Dip(2)*65536+(.Dip(3) And &H7f)*&H1000000
											 */
											if (separator && prevToken.type !== 'Operator' && prevToken.text !== ':') {
												output += ' '
											}
											break
									}
									break
							}
						}
						output += token.text
						hasLine = true
						prevToken = token
						separator = false
						break
					}
				}
			},
		})
		logger().info('[Grammar.format] Standardized in %sms', Date.now() - now)
		return output
	}

	public transpile(script: string): Program {
		const stmts: Statement[] = []

		const formattedScript = this.format(script)

		let now = Date.now()

		progress().details('transpiling')
		const ast = this.parser.getAST(formattedScript, this.GRAMMAR_TARGET_PROGRAM)
		if (ast === null) {
			throw new Error('Unable to transpile script.')
		} else if (ast.rest?.length) {
			const start = formattedScript.length - ast.rest.length
			throw new Error(
				'Unable to transpile script. Syntax error at: ' +
					formattedScript.substr(start, formattedScript.indexOf('\n', start)),
			)
		}
		logger().info('[Grammar.transpile] Parsed in %sms', Date.now() - now)

		const postProcessors = this.postProcessors
		now = Date.now()
		progress().details('post-processing')
		dashAst(ast, {
			leave(node: ESIToken, _parent: ESIToken) {
				if (node.type === 'Program') {
					for (const child of node.children) {
						if (child.estree) {
							if (!Array.isArray(child.estree)) {
								stmts.push(child.estree)
							} else {
								stmts.push(...child.estree)
							}
						}
					}
				} else {
					let estree: any = null
					/**
					 * Loop through all registered post processors until an estree
					 * is returned. If no post processors can handle the node, and
					 * the node has a child, copy it's estree. This will allow estrees
					 * to get propagated to parents, and we wont need to have
					 * post-processors for every single rule in the grammar.
					 */
					for (const postProcessor of postProcessors) {
						estree = postProcessor(node)
						if (estree) {
							break
						}
					}
					if (estree !== null) {
						node.estree = estree
					} else if (node.children[0]) {
						node.estree = node.children[0].estree
					}
				}
			},
		})
		logger().info('[Grammar.transpile] Post-processed in %sms', Date.now() - now)

		return program(stmts)
	}

	public vbsToJs(script: string): string {
		return generate(this.transpile(script))
	}
}
