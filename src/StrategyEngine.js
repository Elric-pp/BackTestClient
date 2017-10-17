const { 
  STOP_ORDER_PREFIX,
  CTAORDER_BUY,
  CTAORDER_SELL,
  CTAORDER_SHORT,
  CTAORDER_COVER
} = require('./util/constant')

module.exports = class StrategyEngine {
  constructor(ctaEngine) {
    this.name = ''
    this.vtSymbol = ''
    this.inited = false
    this.trading = false
    this.pos = 0
    this.ctaEngine = ctaEngine
  }

  onInit() {}
  onStart() {}
  onStop() {}

  /**
   * 
   * 
   * @param {any} tick 
   * @memberof StrategyEngine
   */
  onTick(tick) {}

  /**
   * 
   * 
   * @param {any} bar 
   * @memberof StrategyEngine
   */
  onBar(bar) {}

  /**
   * 
   * 
   * @param {any} order 
   * @memberof StrategyEngine
   */
  onOrder(order) {}

  /**
   * 
   * 
   * @param {any} trade 
   * @memberof StrategyEngine
   */
  onTrade(trade) {}

  /**
   * 买开
   * 
   * @param {any} price 
   * @param {any} volume 
   * @param {boolean} [stop=false] 
   * @memberof StrategyEngine
   */
  buy(price, volume, stop = false) {
    return this.sendOrder(CTAORDER_BUY, price, volume, stop)
  }

  /**
   * 卖平
   * 
   * @param {any} price 
   * @param {any} volume 
   * @param {boolean} [stop=false] 
   * @memberof StrategyEngine
   */
  sell(price, volume, stop = false) {
    return this.sendOrder(CTAORDER_SELL, price, volume, stop)
  }

  /**
   * 卖开
   * 
   * @param {any} price 
   * @param {any} volume 
   * @param {boolean} [stop=false] 
   * @memberof StrategyEngine
   */
  short(price, volume, stop = false) {
    return this.sendOrder(CTAORDER_SHORT, price, volume, stop)
  }

  /**
   * 卖平
   * 
   * @param {any} price 
   * @param {any} volume 
   * @param {boolean} [stop=false] 
   * @memberof StrategyEngine
   */
  cover(price, volume, stop = false) {
    return this.sendOrder(CTAORDER_COVER, price, volume, stop)
  }

  sendOrder(orderType, price, volume, stop = false) {
    if (this.trading) {
      let vtOrderId
      if (stop) {
        vtOrderId = this.ctaEngine.sendStopOrder(this.vtSymbol, orderType, price, volume)
      } else {
        vtOrderId = this.ctaEngine.sendOrder(this.vtSymbol, orderType, price, volume)
      }
      return vtOrderId
    } else {
      // 交易停止时发单返回空字符串
      return ''
    }
  }

  cancelOrder(vtOrderId) {
    // 如果发单号为空字符串，则不进行后续操作
    if (!vtOrderId) {
      return 
    } 

    if (vtOrderId.includes(STOP_ORDER_PREFIX)) {
      this.ctaEngine.cancelStopOrder(vtOrderId)
    } else {
      this.ctaEngine.cancelOrder(vtOrderId)
    }
  }

  loadTick() {
    return this.ctaEngine.loadTick()
  }

  loadBar() {
    return this.ctaEngine.loadBar()
  }
}