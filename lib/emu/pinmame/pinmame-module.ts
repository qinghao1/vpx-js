export interface PinmameModule {
	FS: {
		mkdirTree(p: string): void
		writeFile(p: string, d: Uint8Array): void
		readFile(p: string): Uint8Array
		stat(p: string): { size: number }
	}
	HEAPU8: Uint8Array
	HEAPU32: Uint32Array
	_malloc(n: number): number
	_free(p: number): void
	UTF8ToString(p: number): string
	stringToUTF8(s: string, p: number, max: number): void
	lengthBytesUTF8(s: string): number
	ccall(id: string, rt: string | null, at: string[], args: unknown[]): unknown
	cwrap(id: string, rt: string | null, at: string[]): (...a: unknown[]) => unknown
	getValue(p: number, t: string): number
	setValue(p: number, v: number, t: string): void
}
