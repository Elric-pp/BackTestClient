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

    this.BAR_MODE = BAR_MODE
    this.TICK_MODE = TICK_MODE
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
    this.strategyStartDate = initTimeDelta.valueOf()
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
      func = this.newBar.bind(this)
    } else {
      func = this.newTick.bind(this)
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
    this.time = tick.datetime
    
    this.crossLimitOrder()
    this.crossStopOrder()
    this.strategy.onTick(tick)
    
    this.updateDailyClose(this.time, tick.lastPrice)
  }

  /**
   * 初始化策略
   * 
   * @param {any} strategyClass 
   * @param {any} config 
   */
  initStrategy(strategyClass, config) {
    this.strategy = new strategyClass(this, config)
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
  sendStopOrder(vtSymbol, orderType, price, volume) {
    this.stopOrderCount += 1
    const stopOrderID = STOP_ORDER_PREFIX + this.stopOrderCount
    
    // so = StopOrder()
    const so = {}
    so.vtSymbol = vtSymbol
    so.price = this.roundToPriceTick(price)
    so.volume = volume
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

  loadBar() {
    return this.initData
  }

  loadTick() {
    return this.initData
  }

  /**********************
   **    回测结果相关    **
   **********************/
  /**
   * 计算回测结果
   * 
   */
  calculateBacktestingResult() {
    logger.info('计算回测结果')
    // 首先基于回测后的成交记录，计算每笔交易的盈亏
    // 交易结果列表
    let resultList = []             
    
    // 未平仓的多头交易
    let longTrade = []              
    // 未平仓的空头交易
    let shortTrade = []             
    
    // 每笔成交时间戳
    let tradeTimeList = []          
    // 每笔成交后的持仓情况   
    let posList = [0]               

    for (let t in this.tradeDict) {
      const trade = Object.assign({}, this.tradeDict[t])

      if (trade.direction === DIRECTION_LONG) {
        // 多头交易
        // 如果尚无空头交易
        if (shortTrade.length === 0) {
          longTrade.push(trade)
        } else {
          // 当前多头交易为平空
          let loop = true
          while (loop) {
            const entryTrade = shortTrade[0]
            const exitTrade = trade
            const closedVolume = Math.min(exitTrade.volume, entryTrade.volume)
            const result = generateTradingResult(entryTrade.price, entryTrade.time, exitTrade.price, exitTrade.time, -closedVolume, this.rate, this.slippage, this.size)
            resultList.push(result)

            posList.concat([-1, 0])
            tradeTimeList.concat([result.entryTime, result.exitTime])

            // 计算未清算部分
            entryTrade.volume -= closedVolume
            exitTrade.volume -= closedVolume

            // 如果开仓交易全部清算，则从列表中移除
            if (!entryTrade.volume) {
              shortTrade.shift()
            }

            if (!exitTrade.volume) {
              // 如果平仓交易已经全部清算，则退出循环
              loop = false
              break
            } else {
              // 如果平仓交易未全部清算
              // 且开仓交易已经全部清算完，则平仓交易剩余的部分
              // 等于新的反向开仓交易，添加到队列中
              if (shortTrade.length === 0) {
                longTrade.push(exitTrade)
                loop = false
                break
              } else {
                //  如果开仓交易还有剩余，进入下一轮循环
                continue
              }
            }
          }
        }
      } else {
        // 空头交易
        if (longTrade.length === 0) {
          // 如果尚无多头交易
          shortTrade.push(trade)
        } else {
          // 当前空头交易为平多
          let loop = true
          while (loop) {
            const entryTrade = longTrade[0]
            const exitTrade = trade
            const closedVolume = Math.min(exitTrade.volume, entryTrade.volume)
            const result = generateTradingResult(entryTrade.price, entryTrade.time, exitTrade.price, exitTrade.time, closedVolume, this.rate, this.slippage, this.size)
            resultList.push(result)

            posList.concat([1, 0])
            tradeTimeList.concat(result.entryTime, result.exitTime)

            // 计算未清算部分
            entryTrade.volume -= closedVolume
            exitTrade.volume -= closedVolume

            // 如果开仓交易已经全部清算，则从列表中移除
            if (!entryTrade.volume) {
              longTrade.shift()
            }

            if (!exitTrade.volume) {
              // 如果开仓交易已经全部清算，则退出循环
              loop = false
              break
            } else {
              // 如果开仓交易未全部清算，则平仓交易剩余的部分
              // 等于新的反向开仓交易，添加到队列中
              if (longTrade.length === 0) {
                shortTrade.push(exitTrade)
                loop = false
                break
              } else {
                // 如果开仓交易还有剩余，进入下一轮循环
                continue
              }
            }
          }
        }
      }
    }

    // 到最后交易日尚未平仓的交易，则以最后价格平仓
    let endPrice
    if (this.mode === BAR_MODE) {
      endPrice = this.bar.close
    } else {
      endPrice = this.tick.lastPrice
    }

    for (let t in longTrade) {
      const trade = longTrade[t]
      const result = generateTradingResult(trade.price, trade.time, endPrice, this.time, trade.volume, this.rate, this.slippage, this.size)
      resultList.push(result)
    }

    for (let t in shortTrade) {
      const trade = shortTrade[t]
      const result = generateTradingResult(trade.price, trade.time, endPrice, this.time, trade.volume, this.rate, this.slippage, this.size)
      resultList.push(result)
    }

    if (resultList.length === 0) {
      logger.info('无交易结果')
      return null
    }

    // 基于每笔交易的结果，计算具体的盈亏曲线和最大回撤
    // 资金
    let capital = 0
    // 资金最高净值
    let maxCapital = 0
    // 回撤
    let dropdown = 0
    // 总成交数量
    let totalResult = 0
    // 总成交金额（合约面值）
    let totalTurnover = 0
    // 总手续费
    let totalCommission = 0
    // 总滑点
    let totalSlippage = 0
    // 时间序列
    let timeList = []
    // 每笔盈亏序列
    let pnlList = []
    // 盈亏汇总的时间序列
    let capitalList = []
    // 回撤的时间序列
    let dropdownList = []
    // 盈利次数
    let winningResult = 0
    // 亏损次数
    let losingResult = 0
    // 总盈利金额
    let totalWinning = 0
    // 总亏损金额
    let totalLosing = 0

    for (let r in resultList) {
      const result = resultList[r]
      capital += result.pnl
      maxCapital = Math.max(capital, maxCapital)
      dropdown = capital - maxCapital
      pnlList.push(result.pnl)
      timeList.push(result.exitTime)
      capitalList.push(capital)
      dropdownList.push(dropdown)

      totalResult += 1
      totalTurnover += result.turnover
      totalCommission += result.commission
      totalSlippage += result.slippage

      if (result.pnl >= 0) {
        winningResult += 1
        totalWinning += result.pnl
      } else {
        losingResult += 1
        totalLosing += result.pnl
      }
    }

    // 计算盈亏相关数据
    // 胜率
    const winningRate = winningResult / totalResult * 100

    // 盈利交易平均值
    let averageWinning = totalWinning / winningResult
    // 亏损交易平均值
    let averageLosing = totalLosing / losingResult
    // 盈亏比
    let profitLossRatio = averageLosing ? -averageWinning / averageLosing : 0

    // 返回回测结果

    return {
      capital,
      maxCapital,
      dropdown,
      totalResult,
      totalTurnover,
      totalCommission,
      totalSlippage,
      timeList,
      pnlList,
      capitalList,
      dropdownList,
      winningRate,
      averageWinning,
      averageLosing,
      profitLossRatio,
      posList,
      tradeTimeList
    }
  }

  /**
   * 显示回测结果
   * 
   */
  showBacktestingResult() {
    const r = this.calculateBacktestingResult()
    if (r) {
      logger.info(`第一笔交易：${moment(r.timeList[0]).format('YYYY-MM-DD HH:mm:ss')}`)
      logger.info(`最后一笔交易：${moment(r.timeList[r.timeList.length-1]).format('YYYY-MM-DD HH:mm:ss')}`)
  
      logger.info(`总交易次数：${r.totalResult}`)
      logger.info(`总盈亏：${r.capital}`)
      logger.info(`最大回撤：${Math.min.apply(null, r.dropdownList)}`)
  
      logger.info(`平均盈利：${r.capital / r.totalResult}`)
      logger.info(`平均滑点：${r.totalSlippage / r.totalResult}`)
      logger.info(`平均手续费：${r.totalCommission / r.totalResult}`)
  
      logger.info(`胜率：${r.winningRate}`)
      logger.info(`盈利交易平均值：${r.averageWinning}`)
      logger.info(`亏损交易平均值：${r.averageLosing}`)
      logger.info(`盈亏比：${r.profitLossRatio}`)
    }
  }

  /**
   * 清空回测结果
   * 
   */
  clearBacktestingResult() {
    // 清空限价单相关
    this.limitOrderCount = 0
    this.limitOrderDict = {}
    this.workingLimitOrderDict = {}

    // 清空止损单相关
    this.stopOrderCount = 0
    this.stopOrderDict = {}
    this.workingStopOrderDict = {}

    // 清空成交相关
    this.tradeCount = 0
    this.tradeDict = {}
  }

  /**
   * 更新每日收盘价
   * 
   * @param {any} date 
   * @param {any} price 
   */
  updateDailyClose(date, price) {
    if (!this.dailyResultDict[date]) {
      this.dailyResultDict[date] = new DailyResult(date, price)
    } else {
      this.dailyResultDict[date].closePrice = price
    }
  }

  /**
   * 计算按日统计的交易结果
   * 
   * @returns 
   */
  calculateDailyResult() {
    logger.info('计算按日统计结果')
    
    // 将成交添加到每日交易结果中
    for (let t in this.tradeDict) {
      const trade = this.tradeDict[t]
      const date = moment(trade.time).format('YYYY-MM-DD')
      const dailyResult = this.dailyResultDict[date]
      dailyResult.addTrade(trade)
    }
        
    // 遍历计算每日结果
    let previousClose = 0
    let openPosition = 0

    for (let d in this.dailyResultDict) {
      const dailyResult = this.dailyResultDict[d]
      dailyResult.previousClose = previousClose
      previousClose = dailyResult.closePrice

      dailyResult.calculatePnl(openPosition, this.size, this.rate, this.slippage)
      openPosition = dailyResult.closePosition
    }
        
    // 生成DataFrame
    return this.dailyResultDict
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
        if (startTime >= start && (!end || endTime <= end)) {
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

function generateTradingResult(entryPrice, entryDt, exitPrice, 
  exitDt, volume, rate, slippage, size) {
    const result = {}
    // 开仓价格
    result.entryPrice = entryPrice    
    // 平仓价格
    result.exitPrice = exitPrice      
    
    // 开仓时间datetime    
    result.entryTime = entryDt          
    // 平仓时间
    result.exitTime = exitDt            
    
    // 交易数量（+/-代表方向）
    result.volume = volume    
    
    // 成交金额
    result.turnover = (result.entryPrice + result.exitPrice) * size * Math.abs(volume)   
    // 手续费成本
    result.commission = result.turnover * rate                                
    // 滑点成本
    result.slippage = slippage * 2 * size * Math.abs(volume)                         
    // 净盈亏 
    result.pnl = ((result.exitPrice - result.entryPrice) * volume * size - result.commission - result.slippage)                      
    // console.log(result)
    return result
}

class DailyResult {
  constructor(date, closePrice) {
    // 日期
    this.date = date                
    // 当日收盘价
    this.closePrice = closePrice    
    // 昨日收盘价
    this.previousClose = 0          
    
    // 成交列表
    this.tradeList = []             
    // 成交数量
    this.tradeCount = 0             
    
    // 开盘时的持仓
    this.openPosition = 0           
    // 收盘时的持仓
    this.closePosition = 0          
    
    // 交易盈亏
    this.tradingPnl = 0             
    // 持仓盈亏
    this.positionPnl = 0            
    // 总盈亏
    this.totalPnl = 0               
    
    // 成交量
    this.turnover = 0               
    // 手续费
    this.commission = 0             
    // 滑点
    this.slippage = 0               
    // 净盈亏
    this.netPnl = 0                 
  }

  addTrade(trade) {
    this.tradeList.push(trade)
  }

  /**
   * 计算盈亏
   * 
   * @param {any} self 
   * @param {number} [openPosition=0] 手数
   * @param {number} [size=1]  合约乘数
   * @param {number} [rate=0]  手续费率
   * @param {number} [slippage=0] 滑点
   * @memberof DailyResult
   */
  calculatePnl(self, openPosition = 0, size = 1, rate = 0, slippage = 0) {
    // 持仓部分
    this.openPosition = openPosition
    this.positionPnl = this.openPosition * (this.closePrice - this.previousClose) * size
    this.closePosition = this.openPosition

    // 交易部分
    this.tradeCount = this.tradeList.length

    for (let trade of this.tradeList) {
      let posChange
      if (trade.direction === DIRECTION_LONG) {
        posChange = trade.volume
      } else {
        posChange = -trade.volume
      }

      this.tradingPnl += posChange * (this.closePrice - trade.price) * size
      this.closePosition += posChange
      this.turnover += trade.price * trade.volume * size
      this.commission += trade.price * trade.volume * size * rate
      this.slippage += trade.volume * size * slippage
    }
            
    // 汇总
    this.totalPnl = this.tradingPnl + this.positionPnl
    this.netPnl = this.totalPnl - this.commission - this.slippage

  }
}