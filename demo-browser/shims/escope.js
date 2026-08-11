export class ScopeManager {}
export function analyze() {
	return { scopes: [], acquire: () => null }
}
export default { analyze, ScopeManager }
