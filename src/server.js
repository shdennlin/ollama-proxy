require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const CSVLogger = require('./logger');

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
    console.log(`[PROXY] Received ${req.method} request to ${req.path}`);
    console.log(`[PROXY] Request body:`, JSON.stringify(req.body, null, 2));
    
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
      console.log(`[PROXY] Forwarding to Ollama:`, ollamaUrl);
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
      console.log(`[PROXY] Making request to Ollama...`);
      console.log(`[PROXY] Axios config:`, JSON.stringify({...ollamaConfig, data: '...'}, null, 2));
      
      let response;
      try {
        response = await axios(ollamaConfig);
      } catch (axiosError) {
        console.error(`[PROXY] Axios error:`, axiosError.message);
        console.error(`[PROXY] Axios error code:`, axiosError.code);
        throw axiosError;
      }
      
      const processingEndTime = Date.now();
      console.log(`[PROXY] Got response from Ollama:`, response.status);

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

    } catch (error) {
      logData.error_message = error.message;
      logData.http_status = error.response?.status || 500;
      logData.total_time_ms = Date.now() - req.startTime;
      
      console.error('Proxy error:', error.message);
      res.status(logData.http_status).json({
        error: 'Proxy error',
        message: error.message,
        request_id: req.requestId
      });
    } finally {
      // Log the request
      this.logger.log(logData);
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
      console.log(`🚀 Ollama Proxy Server running on http://${this.host}:${this.port}`);
      console.log(`📊 Logs will be saved to: ${this.logger.logFile}`);
      console.log(`🔗 Proxying to: ${this.ollamaBaseUrl}`);
      console.log(`💡 Usage: Send requests to http://${this.host}:${this.port}/api/generate`);
    });
  }
}

// Start the server
if (require.main === module) {
  const proxy = new OllamaProxy();
  proxy.start();
}

module.exports = OllamaProxy;