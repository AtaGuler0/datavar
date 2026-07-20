/**
 * "Now", frozen at bundle load, so components can bucket time during render
 * without calling an impure clock (react-hooks/purity). A dashboard session
 * is minutes long; period edges drifting by that much changes nothing any
 * chart says.
 */
export const SESSION_NOW = Date.now();
