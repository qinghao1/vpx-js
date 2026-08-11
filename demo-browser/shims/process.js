export const env = {}
export const cwd = () => '/'
export const on = () => {}
export const once = () => {}
export const off = () => {}
export const nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0)
export const type = undefined
export const browser = true
export default { env, cwd, on, once, off, nextTick, type, browser }
