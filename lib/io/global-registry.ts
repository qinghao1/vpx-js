// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Stub registry — in-memory fallback for VBS `RegRead`/`RegWrite`. */
export class GlobalRegistry {
	private readonly store = new Map<string, string | number>()

	private static readonly defaults: Record<string, string | number> = {
		'hklm\\system\\controlset001\\control\\session manager\\environment\\processor_architecture': 'AMD64',
		'hklm\\software\\microsoft\\windows nt\\currentversion\\currentversion': 6.3,
		'hkcu\\software\\visual pinball\\controller\\forcedisableb2s': 0,
		'hkcu\\software\\visual pinball\\controller\\dofcontactors': 2,
		'hkcu\\software\\visual pinball\\controller\\dofknocker': 2,
		'hkcu\\software\\visual pinball\\controller\\dofchimes': 2,
		'hkcu\\software\\visual pinball\\controller\\dofbell': 2,
		'hkcu\\software\\visual pinball\\controller\\dofgear': 2,
		'hkcu\\software\\visual pinball\\controller\\dofshaker': 2,
		'hkcu\\software\\visual pinball\\controller\\dofflippers': 2,
		'hkcu\\software\\visual pinball\\controller\\doftargets': 2,
		'hkcu\\software\\visual pinball\\controller\\dofdroptargets': 2,
		'hkcu\\software\\freeware\\visual pinmame\\globals\\nvram_directory': 'browser://vnrams/',
	}

	public getRegStringAsFloat(_key: string, _value: string, fallback: number): number {
		return fallback
	}

	public regRead(path: string): string | number | undefined {
		const key = this.normalize(path)
		return this.store.get(key) ?? GlobalRegistry.defaults[key]
	}

	public regWrite(key: string, value: string | number): void {
		this.store.set(this.normalize(key), value)
	}

	private normalize(path: string): string {
		return path
			.replace('HKEY_CURRENT_USER\\', 'HKCU\\')
			.replace('HKEY_CLASSES_ROOT\\', 'HKCR\\')
			.replace('HKEY_LOCAL_MACHINE\\', 'HKLM\\')
			.replace('HKEY_USERS\\', 'HKU\\')
			.replace('HKEY_CURRENT_CONFIG\\', 'HKCC\\')
			.toLowerCase()
	}
}

export const registry = new GlobalRegistry()
