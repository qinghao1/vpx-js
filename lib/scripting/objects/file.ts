// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { FS } from './file-system.js'
import type { TextStream } from './text-stream.js'

/**
 * Provides access to all the properties of a file.
 *
 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/file-object
 */
export class File {
	private readonly path: string

	constructor(path: string) {
		this.path = path
	}

	/**
	 * Opens a specified file and returns a TextStream object that can be used to read from, write to, or append to the file.
	 * @param mode Indicates input/output mode. Can be one of three constants: ForReading, ForWriting, or ForAppending.
	 * @param format One of three Tristate values used to indicate the format of the opened file. If omitted, the file is opened as ASCII.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/openastextstream-method
	 */
	public OpenAsTextStream(mode: number, _tristate?: number): TextStream {
		return FS.getStream(this.path, mode).cursorToStart()
	}
}
