const axios = require('axios');

async function testProxy() {
  console.log('Testing direct Ollama connection...');
  try {
    const directResponse = await axios.post('http://192.168.66.50:11434/api/generate', {
      model: "mistral-small3.2-128k",
      prompt: "101+305=? give me answer",
      stream: false
    }, {
      timeout: 10000
    });
    console.log('Direct Ollama response:', directResponse.data.response);
  } catch (error) {
    console.error('Direct Ollama error:', error.message);
  }

  console.log('\nTesting proxy connection...');
  try {
    const proxyResponse = await axios.post('http://localhost:16666/api/generate', {
      model: "mistral-small3.2-128k", 
      prompt: "101+305=? give me answer",
      stream: false
    }, {
      timeout: 10000
    });
    console.log('Proxy response:', proxyResponse.data.response);
  } catch (error) {
    console.error('Proxy error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('Proxy server is not running on port 16666');
    }
  }
}

testProxy();