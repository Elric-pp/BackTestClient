const winston = require('winston');
const toYAML = require('winston-console-formatter')
const path = require('path')

const logger = new winston.Logger({
  level: 'silly'
}); 

logger.add(winston.transports.Console, toYAML.config());
logger.add(winston.transports.File, { filename: path.resolve(__dirname, '../logs/combined.log'), level: 'debug' })

module.exports = logger