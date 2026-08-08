// Minimal IndexedDB cache for decoded textures and table data.
const DB_NAME = 'vpx-js-cache'
const DB_VERSION = 1
const STORE_TEX = 'textures'

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(STORE_TEX)) db.createObjectStore(STORE_TEX)
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

export async function idbGet(key: string): Promise<any | undefined> {
	try {
		const db = await openDB()
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_TEX, 'readonly')
			const req = tx.objectStore(STORE_TEX).get(key)
			req.onsuccess = () => resolve(req.result as any)
			req.onerror = () => reject(req.error)
		})
	} catch {
		return undefined
	}
}

export async function idbSet(key: string, val: any): Promise<void> {
	try {
		const db = await openDB()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_TEX, 'readwrite')
			tx.objectStore(STORE_TEX).put(val, key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch {}
}

export function texCacheKey(name: string, w: number, h: number, mtime = ''): string {
	return `tex:${name.toLowerCase()}:${w}x${h}:${mtime}`
}

export function exrCacheKey(name: string, byteLength: number, kind: string): string {
	return `exr:${name.toLowerCase()}:${kind}:${byteLength}`
}
