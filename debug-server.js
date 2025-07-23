require('dotenv').config();
const axios = require('axios');

console.log('Environment variables:');
console.log('OLLAMA_URL:', process.env.OLLAMA_URL);
console.log('PORT:', process.env.PORT);
console.log('HOST:', process.env.HOST);

// Test Ollama connectivity before starting proxy
async function testOllamaConnection() {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  console.log('\nTesting connection to Ollama at:', ollamaUrl);
  
  try {
    const response = await axios.get(ollamaUrl);
    console.log('✅ Ollama server is reachable');
    return true;
  } catch (error) {
    console.error('❌ Cannot reach Ollama server:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure Ollama is running at', ollamaUrl);
    }
    return false;
  }
}

async function start() {
  const canConnectToOllama = await testOllamaConnection();
  
  if (!canConnectToOllama) {
    console.error('\n⚠️  Warning: Starting proxy but cannot connect to Ollama server');
  }
  
  console.log('\nStarting proxy server...');
  require('./src/server.js');
}

start();