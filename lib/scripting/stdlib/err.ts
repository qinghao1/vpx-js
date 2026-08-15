// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { VbsApi } from '../vbs-api.js'

/**
 * The global error object.
 *
 * @see https://docs.microsoft.com/en-us/dotnet/visual-basic/language-reference/statements/on-error-statement
 */
export class Err extends VbsApi {
	/**
	 * Returns or sets a numeric value specifying an error. Number is the Err object's default property. Read/write.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/number-property-visual-basic-for-applications
	 */
	public Number: number = 0

	/**
	 * Returns or sets a string expression containing a descriptive string associated with an object. Read/write.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/description-property-visual-basic-for-applications
	 */
	public Description = ''

	/**
	 * Returns or sets a string expression specifying the name of the object or application that originally generated the error. Read/write.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/source-property-visual-basic-for-applications
	 */
	public Source = ''

	/**
	 * Returns or sets a string expression containing the context ID for a topic in a Help file. Read/write.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/helpcontext-property-visual-basic-for-applications
	 */
	public HelpContext = ''

	/**
	 * Returns or sets a string expression with the fully qualified path to a Help file. Read/write.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/helpfile-property
	 */
	public HelpFile = ''

	private doThrow = true

	/**
	 * Generates a run-time error.
	 * @param codeOrError Error to be thrown
	 */
	public Raise(codeOrError: VbsError): never | undefined
	public Raise(
		code: number,
		source?: string,
		description?: string,
		helpfile?: string,
		helpcontext?: string,
	): never | undefined
	public Raise(
		codeOrError: number | VbsError,
		source: string = '',
		description: string = '',
		helpfile: string = '',
		helpcontext: string = '',
	): never | undefined {
		if (this.doThrow) {
			if (typeof codeOrError === 'number') {
				throw new Error(`Error ${codeOrError}: ${description}`)
			}
			throw codeOrError
		}
		this.Number = typeof codeOrError === 'number' ? codeOrError : codeOrError.code
		this.Source = source
		this.Description = description
		this.HelpFile = helpfile
		this.HelpContext = helpcontext
	}

	/**
	 * Clears all property settings of the Err object.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/clear-method-visual-basic-for-applications
	 */
	public Clear() {
		this.Number = 0
		this.Description = ''
		this.Source = ''
		this.Description = ''
		this.HelpFile = ''
		this.HelpContext = ''
	}

	public OnErrorGoto0(): void {
		this.doThrow = true
	}

	public OnErrorResumeNext(): void {
		this.doThrow = false
	}

	public valueOf() {
		return this.Number
	}

	protected _getPropertyNames(): string[] {
		return Object.getOwnPropertyNames(Err.prototype)
	}
}

export const ERR = new Err()

/** VbsError. */
export class VbsError extends Error {
	public readonly code: number
	constructor(message: string, code: number) {
		super(message)
		this.code = code
	}
}
