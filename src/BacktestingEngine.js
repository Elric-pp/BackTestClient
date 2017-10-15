const { 
  TICK_MODE,
  BAR_MODE,
  STOP_ORDER_PREFIX,
  ENGINETYPE_BACKTESTING
} = require('./util/constant')

class BacktestingEngine {
  constructor() {
    // 本地停止单
    this.stopOrderCount = 0     // 编号计数：stopOrderID = STOP_ORDER_PREFIX + stopOrderCount
    
    // 本地停止单字典, key为stopOrderID，value为stopOrder对象
    this.stopOrderDict = {}             // 停止单撤销后不会从本字典中删除
    this.workingStopOrderDict = {}      // 停止单撤销后会从本字典中删除
    
    this.engineType = ENGINETYPE_BACKTESTING    // 引擎类型为回测
    
    this.strategy = null        // 回测策略
    this.mode = BAR_MODE   // 回测模式，默认为K线
    
    this.startDate = ''
    this.initDays = 0        
    this.endDate = ''

    this.capital = 1000000      // 回测时的起始本金（默认100万）
    this.slippage = 0           // 回测时假设的滑点
    this.rate = 0               // 回测时假设的佣金比例（适用于百分比佣金）
    this.size = 1               // 合约大小，默认为1    
    this.priceTick = 0          // 价格最小变动 
    
    this.initData = []          // 初始化用的数据
    this.symbol = ''            // 回测集合名
    
    this.dataStartDate = null       // 回测数据开始日期，datetime对象
    this.dataEndDate = null         // 回测数据结束日期，datetime对象
    this.strategyStartDate = null   // 策略启动日期（即前面的数据用于初始化），datetime对象
    
    this.limitOrderCount = 0                    // 限价单编号
    this.limitOrderDict = {}         // 限价单字典
    this.workingLimitOrderDict = {}  // 活动限价单字典，用于进行撮合用
    
    this.tradeCount = 0             // 成交编号
    this.tradeDict = {}  // 成交字典
    
    this.logList = []               // 日志记录
    
    // 当前最新数据，用于模拟成交用
    this.tick = null 
    this.bar =null 
    this.dt = null      // 最新的时间
    
    // 日线回测结果计算用
    this.dailyResultDict = {}
  }

  // 通用功能
  roundToPriceTick(price) {

  }

  /******************* 
   **    参数设置    **
   ******************/

  /**
   * set start date
   * 
   * @param {string} [startDate='20150101'] 
   * @param {string} [initDays='10'] init days for strategy
   * @memberof BacktestingEngine
   */
  setStartDate(startDate='20150101', initDays='10') {

  }

  /**
   * 
   * 
   * @param {string} [endDate=''] 
   * @memberof BacktestingEngine
   */
  setEndDate(endDate = '') {

  }

  /**
   * 
   * 
   * @param {any} mode 
   * @memberof BacktestingEngine
   */
  setMode(mode) {
    this.mode = mode
  }

  /**
   * 
   * 
   * @param {any} capital 
   * @memberof BacktestingEngine
   */
  setCapital(capital) {
    this.capital = capital

  }

  setSlippage(slippage) {
    this.slippage = slippage
  }

  setSize(size) {
    this.size = size
  }

  setRate(rate) {
    this.rate = rate
  }

  setPriceTick(priceTick) {
    this.priceTick = priceTick
  }


  /**********************
   **    数据回放相关    **
   **********************/

  loadHistoryData() {

  }

  runBacktesting() {

  }

  newBar(bar) {

  }

  newTick(tick) {

  }

  initStrategy(strategyClass, config) {

  }

  crossLimitOrder() {

  }

  crossStopOrder() {

  }

  sendOrder() {

  }

  cancelOrder() {

  }

  sendStopOrder() {

  }

  cancelStopOrder() {

  }

  /**********************
   **    回测结果相关    **
   **********************/
  calculateBacktestingResult() {

  }

  showBacktestingResult() {

  }

  clearBacktestingResult() {

  }

  updateDailyClose() {

  }

  calculateDailyResult() {

  }

  showDailyResult() {

  }
}

function generateTradingResult() {
  
}

function generateDailyResult() {
  
}