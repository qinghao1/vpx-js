// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { concatUint8Arrays } from '../../io/binary-helpers.js'
import { ERR } from '../stdlib/err.js'
import { VbsNotImplementedError } from '../vbs-api.js'

/**
 * Facilitates sequential access to file.
 *
 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/textstream-object
 */
export class TextStream {
	public static readonly MODE_READ = 1
	public static readonly MODE_WRITE = 2
	public static readonly MODE_APPEND = 8
	private readonly filename: string
	private readonly unicode: boolean

	private buffer: Uint8Array = new Uint8Array(0)
	private cursor: number = -1
	private mode: number

	constructor(filename: string, unicode: boolean, mode: number) {
		this.filename = filename
		this.unicode = unicode
		this.mode = mode
	}

	/** True if the file pointer immediately precedes the end-of-line marker. (Not implemented.) */
	public get AtEndOfLine() {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Read-only property that returns True if the file pointer is at the end of a TextStream file; False if it is not.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/atendofstream-property
	 */
	public get AtEndOfStream(): boolean {
		return this.cursor >= this.buffer.length - 1
	}

	/** Read-only column number of the current character position. (Not implemented.) */
	public get Column() {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Read-only current line number in the file. (Not implemented.) */
	public get Line() {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Closes an open TextStream file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/close-method-textstream-object
	 */
	public Close(): void {
		this.cursor = 0
		// no file, nothing to close
	}

	/**
	 * Reads a specified number of characters from a TextStream file and returns the resulting string.
	 * @param characters Number of characters that you want to read from the file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/read-method
	 */
	public Read(characters: number): string | undefined {
		if (!this.ensureReadMode()) return
		const text = this.decode(this.buffer.subarray(this.cursor, this.cursor + characters))
		this.cursor += characters
		this.clampCursor()
		return text
	}

	/**
	 * Reads an entire TextStream file and returns the resulting string.
	 * @see f
	 */
	public ReadAll(): string | undefined {
		if (!this.ensureReadMode()) return
		return this.decode(this.buffer)
	}

	/**
	 * Reads an entire line (up to, but not including, the newline character) from a TextStream file and returns the resulting string.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/readline-method
	 */
	public ReadLine(): string | undefined {
		if (!this.ensureReadMode()) return
		const start = this.cursor
		let end = this.cursor
		do {
			this.cursor++
			end++
			if (this.skipLineBreak()) {
				end--
				break
			}
		} while (this.cursor < this.buffer.length - 1)
		return this.decode(this.buffer.subarray(start, end + 1))
	}

	/**
	 * Skips a specified number of characters when reading a TextStream file.
	 * @param characters Number of characters to skip when reading a file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/skip-method
	 */
	public Skip(characters: number): void {
		if (!this.ensureReadMode()) return
		this.cursor += characters
		this.clampCursor()
	}

	/**
	 * Skips the next line when reading a TextStream file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/skipline-method
	 */
	public SkipLine(): void {
		if (!this.ensureReadMode()) return
		do {
			this.cursor++
			if (this.skipLineBreak()) return
		} while (this.cursor < this.buffer.length - 1)
	}

	/**
	 * Writes a specified string to a TextStream file.
	 * @param data The text you want to write to the file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/write-method
	 */
	public Write(data: string): void {
		this.buffer = concatUint8Arrays(this.buffer, new TextEncoder().encode(data))
		this.cursorToEnd()
	}

	/** Writes a specified number of newline characters. (Not implemented.) */
	public WriteBlankLines(_lines: number): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Writes a specified string and newline character to a TextStream file.
	 * @param data The text you want to write to the file. If omitted, a newline character is written to the file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/writeline-method
	 */
	public WriteLine(data: string): void {
		this.Write(`${data}\r\n`)
	}

	public setContent(data: string): this {
		this.buffer = new TextEncoder().encode(data)
		this.cursorToEnd()
		return this
	}

	public setMode(mode: number): this {
		this.mode = mode
		return this
	}

	private ensureReadMode(): boolean {
		if (this.mode === TextStream.MODE_READ) return true
		ERR.Raise(54, undefined, 'Bad file mode')
		return false
	}

	private decode(bytes: Uint8Array): string {
		return new TextDecoder(this.unicode ? 'utf-8' : 'ascii').decode(bytes)
	}

	private skipLineBreak(): boolean {
		if (this.buffer[this.cursor] !== 0x0d) return false
		if (this.cursor < this.buffer.length - 2 && this.buffer[this.cursor + 1] === 0x0a) {
			this.cursor++
		}
		this.cursor++
		return true
	}

	private clampCursor() {
		this.cursor = Math.min(Math.max(-1, this.cursor), this.buffer.length - 1)
	}

	private cursorToEnd() {
		this.cursor = this.buffer.length - 1
	}

	public cursorToStart(): this {
		this.cursor = 0
		return this
	}
}
