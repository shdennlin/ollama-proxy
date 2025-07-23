const axios = require('axios');

async function testAxios() {
  console.log('Testing axios request to Ollama...');
  
  const config = {
    method: 'POST',
    url: 'http://192.168.66.50:11434/api/generate',
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      model: "mistral-small3.2-128k",
      prompt: "test", 
      stream: false
    },
    timeout: 10000,
    validateStatus: () => true
  };
  
  console.log('Request config:', JSON.stringify(config, null, 2));
  
  try {
    console.log('Making request...');
    const response = await axios(config);
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAxios();