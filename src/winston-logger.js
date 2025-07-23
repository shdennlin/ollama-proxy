const winston = require('winston');
const path = require('path');
const DailyRotateFile = require('winston-daily-rotate-file');

// Custom format for console output with colors and better structure
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let output = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      // Handle request logging specially
      if (meta.requestId) {
        output += ` | ReqID: ${meta.requestId}`;
      }
      if (meta.method && meta.path) {
        output += ` | ${meta.method} ${meta.path}`;
      }
      if (meta.statusCode) {
        output += ` | Status: ${meta.statusCode}`;
      }
      if (meta.duration) {
        output += ` | Duration: ${meta.duration}ms`;
      }
      
      // Add other metadata excluding already printed fields
      const otherMeta = { ...meta };
      delete otherMeta.requestId;
      delete otherMeta.method;
      delete otherMeta.path;
      delete otherMeta.statusCode;
      delete otherMeta.duration;
      
      if (Object.keys(otherMeta).length > 0) {
        output += `\n${JSON.stringify(otherMeta, null, 2)}`;
      }
    }
    
    return output;
  })
);

// JSON format for file output
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'ollama-proxy' },
  transports: [
    // Console transport with custom formatting
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    }),
    
    // Daily rotating file for all logs
    new DailyRotateFile({
      filename: path.join('./logs', 'ollama-proxy-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: jsonFormat,
      handleExceptions: true,
      handleRejections: true
    }),
    
    // Separate file for errors
    new DailyRotateFile({
      filename: path.join('./logs', 'ollama-proxy-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat
    })
  ]
});

// Helper function to filter sensitive data
function filterSensitiveData(data, fieldsToMask = ['password', 'token', 'secret', 'authorization', 'cookie']) {
  if (!data || typeof data !== 'object') return data;
  
  const filtered = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in filtered) {
    const lowerKey = key.toLowerCase();
    
    // Check if this key should be masked
    if (fieldsToMask.some(field => lowerKey.includes(field))) {
      filtered[key] = '[REDACTED]';
    } else if (typeof filtered[key] === 'object' && filtered[key] !== null) {
      // Recursively filter nested objects
      filtered[key] = filterSensitiveData(filtered[key], fieldsToMask);
    }
  }
  
  return filtered;
}

// Helper function to truncate large data
function truncateData(data, maxLength = 1000) {
  if (!data) return data;
  
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  if (str.length <= maxLength) return data;
  
  if (typeof data === 'string') {
    return str.substring(0, maxLength) + '... (truncated)';
  } else {
    // For objects, truncate the stringified version and add a truncation notice
    try {
      // Try to parse a partial JSON to keep it valid
      const truncated = str.substring(0, maxLength);
      const lastComma = truncated.lastIndexOf(',');
      const lastBrace = truncated.lastIndexOf('{');
      const lastBracket = truncated.lastIndexOf('[');
      
      // Find a safe truncation point
      let safePoint = Math.max(lastComma, lastBrace, lastBracket);
      if (safePoint > maxLength * 0.8) {
        return { 
          ...JSON.parse(truncated.substring(0, safePoint) + '}'), 
          _truncated: true 
        };
      }
    } catch (e) {
      // Fallback if parsing fails
    }
    
    return { _truncated: true, _message: 'Data too large to display' };
  }
}

// Request logging helper
function logRequest(req, additionalData = {}) {
  const requestData = {
    requestId: req.requestId,
    sessionId: req.sessionId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: filterSensitiveData(req.headers),
    body: truncateData(filterSensitiveData(req.body)),
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    ...additionalData
  };
  
  logger.info('Incoming request', requestData);
}

// Response logging helper
function logResponse(req, res, responseData, additionalData = {}) {
  const duration = Date.now() - req.startTime;
  
  const logData = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration,
    responseSize: JSON.stringify(responseData).length,
    responseData: truncateData(filterSensitiveData(responseData)),
    ...additionalData
  };
  
  if (res.statusCode >= 400) {
    logger.error('Request failed', logData);
  } else if (duration > 5000) {
    logger.warn('Slow request detected', logData);
  } else {
    logger.info('Request completed', logData);
  }
}

// Error logging helper
function logError(error, req = null, additionalData = {}) {
  const errorData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalData
  };
  
  if (req) {
    errorData.requestId = req.requestId;
    errorData.method = req.method;
    errorData.path = req.path;
  }
  
  logger.error('Error occurred', errorData);
}

// Performance logging helper
function logPerformance(req, metrics) {
  const perfData = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ...metrics
  };
  
  logger.debug('Performance metrics', perfData);
}

module.exports = {
  logger,
  logRequest,
  logResponse,
  logError,
  logPerformance,
  filterSensitiveData,
  truncateData
};