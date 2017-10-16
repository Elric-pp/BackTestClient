const { 
  TICK_MODE,
  BAR_MODE,
  STOP_ORDER_PREFIX,
  ENGINETYPE_BACKTESTING,
  STATUS_NOTTRADED,
  STATUS_PARTTRADED,
  STATUS_ALLTRADED,
  STATUS_CANCELLED,
  STATUS_REJECTED,
  STATUS_UNKNOWN,
  DIRECTION_LONG,
  DIRECTION_SHORT,
  DIRECTION_UNKNOWN,
  STOPORDER_WAITING,
  STOPORDER_CANCELLED,
  STOPORDER_TRIGGERED,
  CTAORDER_BUY,
  CTAORDER_SELL,
  CTAORDER_SHORT,
  CTAORDER_COVER,
  OFFSET_OPEN,
  OFFSET_CLOSE,
  OFFSET_UNKNOWN
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
    this.time = null      // 最新的时间
    
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

  /**
   * 新的 K 线
   * 
   * @param {any} bar 
   */
  newBar(bar) {
    this.bar = bar
    this.time = moment(`${bar.tradingDay} ${bar.endTime}`, "YYYY-MM-DD HH:mm:ss").valueOf()
    
    // 先撮合限价单
    this.crossLimitOrder()      
    // 再撮合停止单
    this.crossStopOrder()       
    // 推送K线到策略中
    this.strategy.onBar(bar) 
    
    this.updateDailyClose(bar.tradingDay, bar.close)
  }

  /**
   * 新的 Tick
   * 
   * @param {any} tick 
   */
  newTick(tick) {
    // TODO: time
    this.tick = tick
    this.dt = tick.datetime
    
    this.crossLimitOrder()
    this.crossStopOrder()
    this.strategy.onTick(tick)
    
    this.updateDailyClose(tick.datetime, tick.lastPrice)
  }

  /**
   * 初始化策略
   * 
   * @param {any} strategyClass 
   * @param {any} config 
   */
  initStrategy(strategyClass, config) {
    this.strategy = new strategyClass(config)
  }

  /**
   * 基于最新数据撮合限价单
   * 
   */
  crossLimitOrder() {
    // 先确定会撮合成交的价格
    let buyCrossPrice, sellCrossPrice, buyBestCrossPrice, sellBestCrossPrice
    if (this.mode == this.BAR_MODE) {
        // 若买入方向限价单价格高于该价格，则会成交
        buyCrossPrice = this.bar.low        
        // 若卖出方向限价单价格低于该价格，则会成交
        sellCrossPrice = this.bar.high      
        // 在当前时间点前发出的买入委托可能的最优成交价
        buyBestCrossPrice = this.bar.open   
        // 在当前时间点前发出的卖出委托可能的最优成交价
        sellBestCrossPrice = this.bar.open  
    } else {
        buyCrossPrice = this.tick.askPrice1
        sellCrossPrice = this.tick.bidPrice1
        buyBestCrossPrice = this.tick.askPrice1
        sellBestCrossPrice = this.tick.bidPrice1
    }
    
    // 遍历限价单字典中的所有限价单
    for (let orderID in this.workingLimitOrderDict) {
        let order = this.workingLimitOrderDict[orderID]
        // 推送委托进入队列（未成交）的状态更新
        if (!order.status) {
          order.status = STATUS_NOTTRADED
          this.strategy.onOrder(order)
        }

        // 判断是否会成交
        // 国内的tick行情在涨停时askPrice1为0，此时买无法成交
        const buyCross = (order.direction === DIRECTION_LONG && 
                    order.price >= buyCrossPrice &&
                    buyCrossPrice > 0)     
        
        // 国内的tick行情在跌停时bidPrice1为0，此时卖无法成交
        const sellCross = (order.direction === DIRECTION_SHORT && 
                     order.price <= sellCrossPrice &&
                     sellCrossPrice > 0)
        
        // 如果发生了成交
        if (buyCross || sellCross) {
          // 推送成交数据
          this.tradeCount += 1           // 成交编号自增1
          const tradeID = this.tradeCount + ''
          // const trade = VtTradeData()
          const trade = {} 
          trade.vtSymbol = order.vtSymbol
          trade.tradeID = tradeID
          trade.vtTradeID = tradeID
          trade.orderID = order.orderID
          trade.vtOrderID = order.orderID
          trade.direction = order.direction
          trade.offset = order.offset
           
          // 以买入为例：
          // 1. 假设当根K线的OHLC分别为：100, 125, 90, 110
          // 2. 假设在上一根K线结束(也是当前K线开始)的时刻，策略发出的委托为限价105
          // 3. 则在实际中的成交价会是100而不是105，因为委托发出时市场的最优价格是100
          if (buyCross) {
            trade.price = Math.min(order.price, buyBestCrossPrice)
            this.strategy.pos += order.totalVolume
          } else {
            trade.price = Math.max(order.price, sellBestCrossPrice)
            this.strategy.pos -= order.totalVolume
          }
          
          trade.volume = order.totalVolume
          trade.tradeTime = moment(this.time).format('HH:mm:ss')
          trade.time = this.time
          this.strategy.onTrade(trade)
          
          this.tradeDict[tradeID] = trade
           
          // 推送委托数据
          order.tradedVolume = order.totalVolume
          order.status = STATUS_ALLTRADED
          this.strategy.onOrder(order)
           
          // 从字典中删除该限价单
          delete this.workingLimitOrderDict[orderID]
        }
      }
  }

  /**
   * 基于最新数据撮合止损单
   * 
   */
  crossStopOrder() {
    // 先确定会撮合成交的价格，这里和限价单规则相反
    let buyCrossPrice, sellCrossPrice, bestCrossPrice
    if (this.mode == this.BAR_MODE) {
      // 若买入方向止损单价格低于该价格，则会成交
      buyCrossPrice = this.bar.high    
      // 若卖出方向止损单价格高于该价格，则会成交
      sellCrossPrice = this.bar.low    
      // 最优成交价，买入止损单不能低于，卖出止损单不能高于
      bestCrossPrice = this.bar.open   
    } else {
      buyCrossPrice = this.tick.lastPrice
      sellCrossPrice = this.tick.lastPrice
      bestCrossPrice = this.tick.lastPrice
    }

    // 遍历止损单字典中的所有止损单
    for (let stopOrderID in this.workingStopOrderDict) {
      let so = this.workingStopOrderDict[stopOrderID]
      const buyCross = so.direction === DIRECTION_LONG && so.price <= buyCrossPrice
      const sellCross = so.direction==DIRECTION_SHORT && so.price >= sellCrossPrice
      // 如果发生了成交
      if (buyCross || sellCross) {
        // 更新止损单状态
        so.status = STOPORDER_TRIGGERED
        if (stopOrderID in this.workingStopOrderDict) {
          delete this.workingStopOrderDict[stopOrderID]                           
        }
        // 推送成交数据
        //成交编号自增1
        this.tradeCount += 1            
        const tradeID = this.tradeCount
        // trade = VtTradeData()
        const trade = {}
        trade.vtSymbol = so.vtSymbol
        trade.tradeID = tradeID
        trade.vtTradeID = tradeID 
        if (buyCross) {
          this.strategy.pos += so.volume
          trade.price = Math.max(bestCrossPrice, so.price)
        } else {
          this.strategy.pos -= so.volume
          trade.price = Math.min(bestCrossPrice, so.price)                
        }
        this.limitOrderCount += 1
        const orderID = this.limitOrderCount + ''
        trade.orderID = orderID
        trade.vtOrderID = orderID
        trade.direction = so.direction
        trade.offset = so.offset
        trade.volume = so.volume
        trade.tradeTime = moment(this.time).format('HH:mm:ss')
        trade.time = this.time
        
        this.tradeDict[tradeID] = trade

        // 推送委托数据
        // let order = VtOrderData()
        let order = {}
        order.vtSymbol = so.vtSymbol
        order.symbol = so.vtSymbol
        order.orderID = orderID
        order.vtOrderID = orderID
        order.direction = so.direction
        order.offset = so.offset
        order.price = so.price
        order.totalVolume = so.volume
        order.tradedVolume = so.volume
        order.status = STATUS_ALLTRADED
        order.orderTime = trade.tradeTime
        
        this.limitOrderDict[orderID] = order
        
        // 按照顺序推送数据
        this.strategy.onStopOrder(so)
        this.strategy.onOrder(order)
        this.strategy.onTrade(trade)


      }
    }
  }

  /**
   * 发单
   * 
   * @param {any} vtSymbol 
   * @param {any} orderType 
   * @param {any} price 
   * @param {any} volume 
   * @returns 
   */
  sendOrder(vtSymbol, orderType, price, volume) {
    this.limitOrderCount += 1
    const orderID = this.limitOrderCount
    
    const order = {}
    order.vtSymbol = vtSymbol
    order.price = this.roundToPriceTick(price)
    order.totalVolume = volume
    order.orderID = orderID
    order.vtOrderID = orderID
    order.orderTime = moment(this.time).format('HH:mm:ss')
    
    // CTA委托类型映射
    switch (orderType) {
      case CTAORDER_BUY:
        order.direction = DIRECTION_LONG
        order.offset = OFFSET_OPEN
        break;
      case CTAORDER_SELL:
        order.direction = DIRECTION_SHORT
        order.offset = OFFSET_CLOSE
        break;
      case CTAORDER_SHORT:
        order.direction = DIRECTION_SHORT
        order.offset = OFFSET_OPEN
        break;
      case CTAORDER_COVER:
        order.direction = DIRECTION_LONG
        order.offset = OFFSET_CLOSE     
        break;
      default:
        break;
    }
    
    // 保存到限价单字典中
    this.workingLimitOrderDict[orderID] = order
    this.limitOrderDict[orderID] = order
    
    return orderID
  }

  /**
   * 撤单
   * 
   * @param {any} orderID 
   */
  cancelOrder(orderID) {
    if (orderID in this.workingLimitOrderDict) {
      const order = this.workingLimitOrderDict[orderID]
      order.status = STATUS_CANCELLED
      order.cancelTime = moment(this.time).format('HH:mm:ss')
      delete this.workingLimitOrderDict[orderID]
    }
  }
  
  /**
   * 发停止单（本地实现）
   * 
   * @param {any} vtSymbol 
   * @param {any} orderType 
   * @param {any} price 
   * @param {any} volume 
   * @param {any} strategy 
   */
  sendStopOrder(vtSymbol, orderType, price, volume, strategy) {
    this.stopOrderCount += 1
    const stopOrderID = STOP_ORDER_PREFIX + this.stopOrderCount
    
    // so = StopOrder()
    const so = {}
    so.vtSymbol = vtSymbol
    so.price = this.roundToPriceTick(price)
    so.volume = volume
    so.strategy = strategy
    so.status = STOPORDER_WAITING
    so.stopOrderID = stopOrderID

    // CTA委托类型映射
    switch (orderType) {
      case CTAORDER_BUY:
        so.direction = DIRECTION_LONG
        so.offset = OFFSET_OPEN
        break;
      case CTAORDER_SELL:
        so.direction = DIRECTION_SHORT
        so.offset = OFFSET_CLOSE
        break;
      case CTAORDER_SHORT:
        so.direction = DIRECTION_SHORT
        so.offset = OFFSET_OPEN
        break;
      case CTAORDER_COVER:
        so.direction = DIRECTION_LONG
        so.offset = OFFSET_CLOSE      
        break;
      default:
        break;
    }

    // 保存stopOrder对象到字典中
    this.stopOrderDict[stopOrderID] = so
    this.workingStopOrderDict[stopOrderID] = so
    
    // 推送停止单初始更新
    this.strategy.onStopOrder(so)        
    
    return stopOrderID
  }

  /**
   * 撤销停止单
   * 
   * @param {any} stopOrderID 
   */
  cancelStopOrder(stopOrderID) {
    // 检查停止单是否存在
    if (stopOrderID in this.workingStopOrderDict) {
      const so = this.workingStopOrderDict[stopOrderID]
      so.status = STOPORDER_CANCELLED
      delete this.workingStopOrderDict[stopOrderID]
      this.strategy.onStopOrder(so)
    }
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