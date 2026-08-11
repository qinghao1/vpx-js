import * as dashAstReal from 'dash-ast'
import * as escopeReal from 'escope'
import * as escopeShim from './escope.js'

export function createRequire() {
	return p => {
		if (p === 'escope') {
			const m = escopeReal
			return m.analyze ? m : (m.default ?? escopeShim)
		}
		if (p === 'dash-ast') {
			const m = dashAstReal
			return m.default ?? m
		}
		console.warn('dummy require', p)
		if (p && p.includes('res/meshes')) {
			throw new Error('mesh not inlined ' + p)
		}
		return {}
	}
}
export default { createRequire }
