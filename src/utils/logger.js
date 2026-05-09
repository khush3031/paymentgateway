const fs = require('fs');
const path = require('path');
const winston = require('winston');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  baseFormat,
  winston.format.printf(({ timestamp, level, message, metadata, stack }) => {
    const meta = metadata && Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : '';
    return `${timestamp} ${level} ${message}${stack ? ` ${stack}` : ''}${meta}`;
  })
);

const jsonFormat = winston.format.combine(baseFormat, winston.format.json());

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'test' ? 'error' : 'info',
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' ? devFormat : jsonFormat
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      format: jsonFormat
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: jsonFormat
    })
  ]
});

module.exports = logger;
