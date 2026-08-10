// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { getTextFile, hasTextFile } from '../../refs.node.js'
import { TextStream } from './text-stream.js'

/** FileSystem. */
export class FileSystem {
	private readonly files = new Map<string, TextStream>()

	public addStream(fileName: string, stream: TextStream): TextStream {
		this.files.set(this.normalizePath(fileName), stream)
		return stream
	}

	public getStream(fileName: string, iomode: number = 1): TextStream {
		if (!this.files.has(this.normalizePath(fileName))) {
			return new TextStream(fileName, true, iomode).setContent(getTextFile(fileName))
		}
		return this.files.get(this.normalizePath(fileName))?.setMode(iomode)
	}

	public deleteFile(fileName: string) {
		this.files.delete(this.normalizePath(fileName))
	}

	public fileExists(fileName: string): boolean {
		if (this.files.has(this.normalizePath(fileName))) return true
		return hasTextFile(fileName)
	}

	public folderExists(folderName: string) {
		const n = folderName?.trim()
		if (!n || n === '.' || n === './' || n === '.\\' || n === '/' || n === '\\') return true
		const f = this.normalizePath(folderName)
		for (const fileName of this.files.keys()) {
			if (fileName.startsWith(f)) {
				return true
			}
		}
		return false
	}

	public clearAll() {
		this.files.clear()
	}

	private normalizePath(path: string): string {
		return path.replace(/\\+/g, '/').toLowerCase()
	}
}

export const FS = new FileSystem()
