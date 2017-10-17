const BacktestingEngine = require('../src/BacktestingEngine')
const DemoStrategy = require('./demoStrategy')

const engine = new BacktestingEngine()

console.time('backtesting')
engine.setMode(engine.BAR_MODE)

engine.setStartDate('20170510', 5)


engine.setSlippage(0.5)
engine.setRate(0.0005)
engine.setSize(5)
engine.setPriceTick(5)

engine.setDatabase('v')

engine.initStrategy(DemoStrategy)

engine.runBacktesting()
  .then(() => {
    engine.showBacktestingResult()
    console.timeEnd('backtesting')
  })

