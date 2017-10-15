const winston = require('winston')
const path = require('path')

// module.exports = logger
const transports = {
  console: new winston.transports.Console({ level: 'debug' }),
  file: new winston.transports.File({ filename: path.resolve(__dirname, '../logs/combined.log'), level: 'debug' })
};

const logger = winston.createLogger({
  transports: [
    transports.console,
    transports.file
  ]
});

logger.info('Will not be logged in either transport!');
// transports.console.level = 'info';
// transports.file.level = 'info';
logger.info('Will be logged in both transports!');