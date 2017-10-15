const { 
  TICK_MODE,
  BAR_MODE,
  STOP_ORDER_PREFIX,
  ENGINETYPE_BACKTESTING
} = require('./util/constant')
const moment = require('moment')
const csv = require('fast-csv')
const path = require('path')
const logger = require('./logger')

module.exports = class BacktestingEngine {
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
    this.data = []              // 回测数据
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
    if (!this.priceTick) {
      return price
    }

    const newPrice = Math.round(price / this.priceTick) * this.priceTick
    return newPrice
  }

  /******************* 
   **    参数设置    **
   ******************/

  /**
   * set start date
   * 设置回测的启动日期
   * @param {string} [startDate='20150101'] 
   * @param {string} [initDays='10'] init days for strategy
   * @memberof BacktestingEngine
   */
  setStartDate(startDate='20150101', initDays='10') {
    this.startDate = startDate
    this.initDays = initDays
    
    const date = moment(startDate, "YYYYMMDD")
    this.dataStartDate = date.valueOf()
    
    const initTimeDelta = date.add(initDays, 'd')
    this.strategyStartDate = this.dataStartDate + initTimeDelta
  }

  /**
   * set end date
   * 设置回测的结束日期
   * 
   * @param {string} [endDate=''] 
   * @memberof BacktestingEngine
   */
  setEndDate(endDate = '') {
    this.endDate = endDate
    
    if(endDate) {
      // 为了包括最后一天，添加一天
      this.dataEndDate = moment(endDate, "YYYYMMDD").add(1, 'd').valueOf()
    }
  }

  /**
   * 
   * 设置回测模式 TICK_MODE , BAR_MODE
   * @param {any} mode 
   * @memberof BacktestingEngine
   */
  setMode(mode) {
    this.mode = mode
  }

  /**
   * 设置回测品种 symbol
   * 
   * @param {any} symbol 
   * @memberof BacktestingEngine
   */
  setDatabase(symbol) {
    this.symbol = symbol
  }

  /**
   * 
   * 设置回测资金
   * @param {any} capital 
   * @memberof BacktestingEngine
   */
  setCapital(capital) {
    this.capital = capital
  }

  /**
   * 设置滑点
   * 
   * @param {any} slippage 
   * @memberof BacktestingEngine
   */
  setSlippage(slippage) {
    this.slippage = slippage
  }

  /**
   * 设置合约一手的数量
   * 
   * @param {any} size 
   * @memberof BacktestingEngine
   */
  setSize(size) {
    this.size = size
  }

  /**
   * 设置佣金比率
   * 
   * @param {any} rate 
   * @memberof BacktestingEngine
   */
  setRate(rate) {
    this.rate = rate
  }

  /**
   * 设置最小变动价格
   * 
   * @param {any} priceTick 
   * @memberof BacktestingEngine
   */
  setPriceTick(priceTick) {
    this.priceTick = priceTick
  }


  /**********************
   **    数据回放相关    **
   **********************/

  /**
   * 加载历史数据
   * 
   * @memberof BacktestingEngine
   */
  async loadHistoryData() {

    // log start
  
    let func
    // 首先根据回测模式，确认要使用的数据类
    if (this.mode == BAR_MODE) {
      func = loadBarDataFromCsv
    } else {
      func = loadTickDataFromCsv
    }

    // 载入初始化需要用的数据
    this.initData = await func(this.symbol, this.dataStartDate, this.strategyStartDate)
    
    // 载入回测数据
    this.data = await func(this.symbol, this.strategyStartDate, this.dataEndDate)

    logger.info(`载入完成，数据量：${this.initData.length + this.data.length}`)
  }

  /**
   * 运行回测
   * 
   */
  async runBacktesting() {
    // 载入历史数据
    await this.loadHistoryData()
    

    // 首先根据回测模式，确认要使用的数据类
    let func
    if (this.mode == this.BAR_MODE) {
      func = this.newBar
    } else {
      func = this.newTick
    }

    logger.info('开始回测')
    
    this.strategy.inited = true
    this.strategy.onInit()
    logger.info('策略初始化完成')
    
    this.strategy.trading = true
    this.strategy.onStart()
    logger.info('策略启动完成')
    
    logger.info('开始回放数据')

    for (let d of this.data) {
      func(d)
    }

    logger.info('数据回放结束')
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

function loadBarDataFromCsv(symbol, start, end) {
  return new Promise((resolve) => {
    const data = []
    csv
      .fromPath(path.resolve(__dirname, `./data/${symbol}.csv`), {headers: true})
      .on("data", function(row){
        const startTime = moment(`${row.tradingDay} ${row.startTime}`, "YYYY-MM-DD HH:mm:ss").valueOf()
        const endTime = moment(`${row.tradingDay} ${row.endTime}`, "YYYY-MM-DD HH:mm:ss").valueOf()
        if (startTime >= start && end && endTime <= end) {
            data.push(row)
        }
      })
      .on("end", function(){
        resolve(data)
      });
  })
}

function loadTickDataFromCsv(symbol, start, end) {
  return new Promise((resolve) => {
    resolve([])
  })
}

function generateTradingResult() {
  
}

function generateDailyResult() {
  
}