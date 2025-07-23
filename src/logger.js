const fs = require('fs');
const path = require('path');

class CSVLogger {
  constructor(logPath = './logs') {
    this.logPath = logPath;
    this.logFile = path.join(logPath, 'ollama-proxy.csv');
    this.initializeLogFile();
  }

  initializeLogFile() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }

    // Create CSV with headers if file doesn't exist
    if (!fs.existsSync(this.logFile)) {
      const headers = [
        'timestamp',
        'request_id',
        'ip_source',
        'user_agent',
        'http_method',
        'endpoint',
        'model',
        'input_tokens',
        'output_tokens',
        'total_tokens',
        'request_size_bytes',
        'response_size_bytes',
        'queue_time_ms',
        'processing_time_ms',
        'total_time_ms',
        'http_status',
        'error_message',
        'model_parameters',
        'stream_mode',
        'system_load_cpu',
        'system_load_memory',
        'concurrent_requests',
        'session_id'
      ].join(',') + '\n';
      
      fs.writeFileSync(this.logFile, headers, 'utf8');
    }
  }

  formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
    return String(value).replace(/"/g, '""');
  }

  log(data) {
    const timestamp = new Date().toISOString();
    
    const row = [
      timestamp,
      data.request_id || '',
      data.ip_source || '',
      data.user_agent || '',
      data.http_method || '',
      data.endpoint || '',
      data.model || '',
      data.input_tokens || 0,
      data.output_tokens || 0,
      data.total_tokens || 0,
      data.request_size_bytes || 0,
      data.response_size_bytes || 0,
      data.queue_time_ms || 0,
      data.processing_time_ms || 0,
      data.total_time_ms || 0,
      data.http_status || '',
      data.error_message || '',
      this.formatValue(data.model_parameters),
      data.stream_mode || false,
      data.system_load_cpu || 0,
      data.system_load_memory || 0,
      data.concurrent_requests || 0,
      data.session_id || ''
    ].map(val => `"${this.formatValue(val)}"`).join(',') + '\n';

    fs.appendFileSync(this.logFile, row, 'utf8');
  }

  getSystemLoad() {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu: process.cpuUsage(),
      memory: Math.round((usedMem / totalMem) * 100)
    };
  }
}

module.exports = CSVLogger;