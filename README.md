# Ollama Proxy with CSV Logging

A simple proxy server for Ollama that logs all requests and responses to CSV format with comprehensive metrics tracking.

## Features

- **Complete Request Proxying**: Forwards all requests to Ollama server
- **Comprehensive CSV Logging**: Tracks 20+ metrics per request
- **Auto-append Logging**: Continuously appends to CSV file
- **System Monitoring**: CPU and memory usage tracking
- **Error Handling**: Robust error handling and recovery
- **Health Monitoring**: Built-in health check endpoint

## Logged Metrics

The proxy automatically logs these metrics to `logs/ollama-proxy.csv`:

**Request Info**: timestamp, request_id, ip_source, user_agent, http_method, endpoint, session_id
**Model Info**: model, input_tokens, output_tokens, total_tokens, model_parameters, stream_mode
**Performance**: request_size_bytes, response_size_bytes, queue_time_ms, processing_time_ms, total_time_ms
**System**: http_status, error_message, system_load_cpu, system_load_memory, concurrent_requests

## Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Ollama** (if not already running):
   ```bash
   ollama serve
   ```

3. **Start the Proxy**:
   ```bash
   ./start.sh
   # or manually: npm start
   ```

4. **Use the Proxy**: Send requests to `http://localhost:3001` instead of `http://localhost:11434`

## Configuration

Copy `.env.example` to `.env` and modify as needed:

```env
OLLAMA_URL=http://localhost:11434  # Ollama server URL
HOST=localhost                     # Server host (use 0.0.0.0 for public access)
PORT=3001                          # Proxy server port
LOG_PATH=./logs                    # Log directory
```

**Host Configuration:**
- `HOST=localhost` - Only accessible from the local machine (default, secure)
- `HOST=0.0.0.0` - Accessible from any network interface (public access)
- `HOST=192.168.1.100` - Bind to specific IP address

## Usage Examples

**Generate Text**:
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "prompt": "Hello, world!",
    "stream": false
  }'
```

**Chat**:
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Health Check**:
```bash
curl http://localhost:3001/health
```

## Log Analysis

The CSV logs can be analyzed with any spreadsheet application or data analysis tools:

- **Excel/Google Sheets**: Open `logs/ollama-proxy.csv`
- **Python**: Use pandas: `pd.read_csv('logs/ollama-proxy.csv')`
- **Command Line**: Use tools like `awk`, `cut`, or `csvkit`

## Architecture

```
Client → Proxy Server → Ollama Server
         ↓
      CSV Logger
```

The proxy intercepts all requests, forwards them to Ollama, captures the response, logs metrics, and returns the response to the client.

## Development

**Watch Mode**:
```bash
npm run dev
```

**Manual Start**:
```bash
node src/server.js
```