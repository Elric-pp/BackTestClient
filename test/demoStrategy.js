const StrategyEngine = require('../src/StrategyEngine')

module.exports = class DemoStrategy extends StrategyEngine {
  constructor(ctaEngine) {
    super(ctaEngine)
    this.fastK = 0.9     // 快速EMA参数
    this.slowK = 0.1     // 慢速EMA参数
    
    this.fastMa = []             // 快速EMA均线数组
    this.fastMa0 = 0   // 当前最新的快速EMA
    this.fastMa1 = 0   // 上一根的快速EMA

    this.slowMa = []             // 与上面相同
    this.slowMa0 = 0
    this.slowMa1 = 0
  }
  onBar(bar) {
    if (!this.fastMa0) {        
      this.fastMa0 = bar.close
      this.fastMa.push(this.fastMa0)
    } else {
      this.fastMa1 = this.fastMa0
      this.fastMa0 = bar.close * this.fastK + this.fastMa0 * (1 - this.fastK)
      this.fastMa.push(this.fastMa0)
    }
        
    if (!this.slowMa0) {
      this.slowMa0 = bar.close
      this.slowMa.push(this.slowMa0)
    } else {
      this.slowMa1 = this.slowMa0
      this.slowMa0 = bar.close * this.slowK + this.slowMa0 * (1 - this.slowK)
      this.slowMa.push(this.slowMa0)
    }
        
    // 判断买卖
    const crossOver = this.fastMa0>this.slowMa0 && this.fastMa1<this.slowMa1     // 金叉上穿
    const crossBelow = this.fastMa0<this.slowMa0 && this.fastMa1>this.slowMa1    // 死叉下穿
    
    // 金叉和死叉的条件是互斥
    // 所有的委托均以K线收盘价委托（这里有一个实盘中无法成交的风险，考虑添加对模拟市价单类型的支持）
    if (crossOver) {
        // 如果金叉时手头没有持仓，则直接做多
      if (this.pos === 0) {
        this.buy(bar.close, 1)
      // 如果有空头持仓，则先平空，再做多
      } else if (this.pos < 0) {
        this.cover(bar.close, 1)
        this.buy(bar.close, 1)
      }
    // 死叉和金叉相反
    } else if (crossBelow) {
      if (this.pos == 0) {
        this.short(bar.close, 1)
      } else if (this.pos > 0) {
        this.sell(bar.close, 1)
        this.short(bar.close, 1)
      }
    }
  }
}