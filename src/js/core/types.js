/**
 * @typedef {Object} Asset
 * @property {string} sym
 * @property {string} name
 * @property {string} sector
 * @property {number} price
 * @property {number} mu
 * @property {number} sigma
 * @property {number} k
 * @property {number} supply
 * @property {number[]} history
 * @property {number[]} dayBounds
 * @property {number} localDemand
 * @property {number} impulse
 * @property {number} fair
 * @property {{mu:number, sigma:number}} regime
 * @property {number} streak
 * @property {number} runStart
 * @property {number[]} flowWindow
 * @property {number} flowToday
 * @property {number} evDemandBias
 * @property {number} daySigma
 * @property {{mu:number, sigma:number, gap:number}|null} outlook
 * @property {{gMu:number, evMu:number, evDem:number, valuation:number, streakMR:number, demandTerm:number}|null} outlookDetail
 * @property {{tone:'Bullish'|'Neutral'|'Bearish', cls:string, score:number, conf:number}} analyst
 */
