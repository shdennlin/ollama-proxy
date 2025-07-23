require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const CSVLogger = require('./logger');
const { logger, logRequest, logResponse, logError, logPerformance } = require('./winston-logger');

class OllamaProxy {
  constructor() {
    this.app = express();
    this.logger = new CSVLogger();
    this.concurrentRequests = 0;
    this.ollamaBaseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.port = process.env.PORT || 3001;
    this.host = process.env.HOST || 'localhost';
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Request tracking middleware
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      req.requestId = uuidv4();
      req.sessionId = req.headers['x-session-id'] || req.ip;
      this.concurrentRequests++;
      
      res.on('finish', () => {
        this.concurrentRequests--;
      });
      
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        ollama_url: this.ollamaBaseUrl,
        concurrent_requests: this.concurrentRequests 
      });
    });

    // Proxy all Ollama API endpoints
    this.app.all('/api/*', this.proxyRequest.bind(this));
    
    // Root proxy for direct Ollama calls
    this.app.all('*', this.proxyRequest.bind(this));
  }

  async proxyRequest(req, res) {
    // Log incoming request with Winston
    logRequest(req, {
      endpoint: req.path,
      bodySize: JSON.stringify(req.body || {}).length,
      concurrentRequests: this.concurrentRequests
    });
    
    const logData = {
      request_id: req.requestId,
      ip_source: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      http_method: req.method,
      endpoint: req.path,
      session_id: req.sessionId,
      concurrent_requests: this.concurrentRequests,
      request_size_bytes: JSON.stringify(req.body || {}).length
    };

    try {
      const queueStartTime = Date.now();
      
      // Prepare Ollama request
      const ollamaUrl = `${this.ollamaBaseUrl}${req.path}`;
      logger.debug('Forwarding to Ollama', { 
        requestId: req.requestId,
        ollamaUrl,
        method: req.method
      });
      const ollamaConfig = {
        method: req.method,
        url: ollamaUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        data: req.body,
        timeout: 300000, // 5 minutes
        validateStatus: () => true // Don't throw on HTTP errors
      };

      const processingStartTime = Date.now();
      logger.debug('Making request to Ollama', {
        requestId: req.requestId,
        timeout: ollamaConfig.timeout,
        dataSize: JSON.stringify(ollamaConfig.data || {}).length
      });
      
      let response;
      try {
        response = await axios(ollamaConfig);
      } catch (axiosError) {
        logError(axiosError, req, {
          errorCode: axiosError.code,
          ollamaUrl
        });
        throw axiosError;
      }
      
      const processingEndTime = Date.now();
      logger.debug('Got response from Ollama', {
        requestId: req.requestId,
        status: response.status,
        responseSize: JSON.stringify(response.data).length
      });

      // Extract metrics from response
      const responseData = response.data;
      logData.model = this.extractModel(req.body, responseData);
      logData.input_tokens = this.extractInputTokens(responseData);
      logData.output_tokens = this.extractOutputTokens(responseData);
      logData.total_tokens = (logData.input_tokens || 0) + (logData.output_tokens || 0);
      logData.model_parameters = this.extractModelParameters(req.body);
      logData.stream_mode = req.body?.stream || false;
      logData.response_size_bytes = JSON.stringify(responseData).length;
      logData.http_status = response.status;
      logData.queue_time_ms = processingStartTime - queueStartTime;
      logData.processing_time_ms = processingEndTime - processingStartTime;
      logData.total_time_ms = Date.now() - req.startTime;

      // System metrics
      const systemLoad = this.logger.getSystemLoad();
      logData.system_load_cpu = systemLoad.cpu.user;
      logData.system_load_memory = systemLoad.memory;

      // Send response to client
      res.status(response.status);
      Object.keys(response.headers).forEach(key => {
        res.set(key, response.headers[key]);
      });
      res.send(responseData);
      
      // Log successful response
      logResponse(req, res, responseData, {
        model: logData.model,
        inputTokens: logData.input_tokens,
        outputTokens: logData.output_tokens,
        queueTime: logData.queue_time_ms,
        processingTime: logData.processing_time_ms
      });

    } catch (error) {
      logData.error_message = error.message;
      logData.http_status = error.response?.status || 500;
      logData.total_time_ms = Date.now() - req.startTime;
      
      logError(error, req, {
        phase: 'proxy_request',
        endpoint: req.path
      });
      const errorResponse = {
        error: 'Proxy error',
        message: error.message,
        request_id: req.requestId
      };
      res.status(logData.http_status).json(errorResponse);
      
      // Log error response
      logResponse(req, res, errorResponse, {
        errorType: error.name,
        errorCode: error.code
      });
    } finally {
      // Log the request to CSV
      this.logger.log(logData);
      
      // Log performance metrics
      if (logData.total_time_ms) {
        logPerformance(req, {
          queueTime: logData.queue_time_ms,
          processingTime: logData.processing_time_ms,
          totalTime: logData.total_time_ms,
          model: logData.model,
          tokens: logData.total_tokens
        });
      }
    }
  }

  extractModel(requestBody, responseData) {
    return requestBody?.model || 
           responseData?.model || 
           responseData?.message?.model || 
           'unknown';
  }

  extractInputTokens(responseData) {
    return responseData?.prompt_eval_count || 
           responseData?.usage?.prompt_tokens || 
           0;
  }

  extractOutputTokens(responseData) {
    return responseData?.eval_count || 
           responseData?.usage?.completion_tokens || 
           0;
  }

  extractModelParameters(requestBody) {
    if (!requestBody) return null;
    
    const params = {};
    const paramKeys = ['temperature', 'top_p', 'top_k', 'max_tokens', 'num_predict', 'repeat_penalty'];
    
    paramKeys.forEach(key => {
      if (requestBody[key] !== undefined) {
        params[key] = requestBody[key];
      }
    });

    return Object.keys(params).length > 0 ? params : null;
  }

  start() {
    this.app.listen(this.port, this.host, () => {
      logger.info('🚀 Ollama Proxy Server started', {
        host: this.host,
        port: this.port,
        csvLogFile: this.logger.logFile,
        ollamaBaseUrl: this.ollamaBaseUrl,
        logLevel: process.env.LOG_LEVEL || 'info'
      });
      logger.info(`💡 Usage: Send requests to http://${this.host}:${this.port}/api/generate`);
    });
  }
}

// Start the server
if (require.main === module) {
  const proxy = new OllamaProxy();
  proxy.start();
}

module.exports = OllamaProxy;