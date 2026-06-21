const config = require('./config');

async function test() {
  const model = config.getDefaultModel();
  console.log('模型配置:', JSON.stringify(model, null, 2));
  
  const url = model.endpoint.endsWith('/chat/completions') 
    ? model.endpoint 
    : model.endpoint + '/chat/completions';
  
  console.log('请求 URL:', url);
  
  const body = {
    model: model.name,
    messages: [
      { role: 'system', content: '你是 Yicalw，一个简单的测试。请用一句话自我介绍。' },
      { role: 'user', content: '你好' }
    ],
    stream: false
  };
  
  console.log('请求体:', JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + model.apiKey
      },
      body: JSON.stringify(body)
    });
    
    console.log('响应状态:', response.status);
    
    const data = await response.json();
    console.log('完整响应:', JSON.stringify(data, null, 2));
    
    const choice = data.choices?.[0];
    if (choice) {
      console.log('回复内容:', choice.message?.content);
    } else {
      console.log('⚠️ choices 为空');
    }
  } catch (e) {
    console.error('请求失败:', e.message);
    console.error(e.stack);
  }
}

test();
