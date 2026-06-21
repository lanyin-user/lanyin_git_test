/**
 * Yicalw - Web 服务器 + WebSocket
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

let serverInstance = null;
let ioInstance = null;

function start(port = 5050) {
  const app = express();
  
  // 解析 JSON body
  app.use(express.json());
  
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  serverInstance = server;
  ioInstance = io;

  // 静态文件服务
  const staticPath = path.join(__dirname, 'public');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
  }

  // API: 发送消息
  app.post('/api/message', async (req, res) => {
    try {
      const { message } = req.body;
      console.log('[Server] 收到消息:', message);
      if (!message) {
        return res.status(400).json({ error: '缺少消息内容' });
      }

      // 转发给 agent 处理
      const agent = require('./agent');
      const result = await agent.process(message, io);
      
      console.log('[Server] Agent 返回结果:', typeof result, result);
      
      // 处理新的返回格式
      let responseResult = result;
      if (typeof result === 'object' && result.output) {
        responseResult = result.output;
      }
      
      res.json({ result: responseResult || '' });
    } catch (e) {
      console.error('[Server] 处理消息失败:', e);
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  // API: 获取设置
  app.get('/api/settings', (req, res) => {
    const config = require('./config');
    const cfg = config.getConfig();
    const models = cfg.models || [];
    const defaultModel = models[0] || {};
    res.json({
      apiUrl: defaultModel.endpoint || '',
      apiKey: defaultModel.apiKey || '',
      model: defaultModel.name || ''
    });
  });

  // API: 保存设置
  app.post('/api/settings', (req, res) => {
    const { apiUrl, apiKey, model } = req.body;
    const config = require('./config');
    const cfg = config.getConfig();
    if(cfg.models && cfg.models.length > 0) {
      if(apiUrl) cfg.models[0].endpoint = apiUrl;
      if(apiKey) cfg.models[0].apiKey = apiKey;
      if(model) cfg.models[0].name = model;
    }
    config.saveConfig(cfg);
    res.json({ success: true });
  });

  // API: 获取配置
  app.get('/api/config', (req, res) => {
    const config = require('./config');
    res.json(config.getConfig());
  });

  // API: 更新配置
  app.post('/api/config', (req, res) => {
    const config = require('./config');
    config.saveConfig();
    res.json({ success: true });
  });

  // API: 清空对话
  app.post('/api/clear', (req, res) => {
    const agent = require('./agent');
    agent.clearHistory();
    res.json({ success: true });
  });

  // API: 获取任务列表
  app.get('/api/tasks', (req, res) => {
    const scheduler = require('./scheduler');
    res.json(scheduler.listTasks());
  });

  // API: 添加任务
  app.post('/api/tasks', async (req, res) => {
    const scheduler = require('./scheduler');
    const { execute_at, intent, interval_minutes } = req.body;
    const result = scheduler.addTask(execute_at, intent, interval_minutes || 0);
    res.json({ result });
  });

  // API: 删除任务
  app.delete('/api/tasks/:id', (req, res) => {
    const scheduler = require('./scheduler');
    const result = scheduler.removeTask(req.params.id);
    res.json({ result });
  });



  // ===== Skills API =====
  const SKILLS_DIR = path.join(__dirname, 'skills');
  
  function ensureSkillsDir() {
    if(!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
  }
  
  function listSkillFiles() {
    ensureSkillsDir();
    try {
      return fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json')).sort();
    } catch(e) { return []; }
  }
  
  // 获取所有技能列表
  app.get('/api/skills', (req, res) => {
    const files = listSkillFiles();
    const skills = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf-8'));
        return { id: f.replace('.json', ''), ...data };
      } catch(e) { return null; }
    }).filter(Boolean);
    res.json(skills);
  });
  
  // 获取单个技能详情
  app.get('/api/skills/:id', (req, res) => {
    const filePath = path.join(SKILLS_DIR, req.params.id + '.json');
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.json({ id: req.params.id, ...data });
    } catch(e) {
      res.status(404).json({ error: '技能不存在' });
    }
  });
  
  // 删除技能
  app.delete('/api/skills/:id', (req, res) => {
    const filePath = path.join(SKILLS_DIR, req.params.id + '.json');
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: '删除失败' });
    }
  });
  
  // 生成技能（通过 LLM）
  app.post('/api/skills/generate', async (req, res) => {
    const { description } = req.body;
    if(!description) {
      return res.status(400).json({ error: '缺少描述' });
    }
    
    try {
      const model = require('./config').getDefaultModel();
      const url = model.endpoint.endsWith('/chat/completions') 
        ? model.endpoint 
        : model.endpoint + '/chat/completions';
      
      const prompt = `你是一个技能生成器。根据用户的描述，生成一个完整的技能定义。技能是一个可以让 AI 助手执行特定任务的指令集合。

请按照以下格式生成技能（使用 JSON 格式）：
{
  "name": "技能名称",
  "description": "技能描述",
  "content": "技能的详细指令内容，告诉 AI 如何执行这个技能"
}

用户描述: ${description}

只输出 JSON，不要其他内容。`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + model.apiKey
        },
        body: JSON.stringify({
          model: model.name,
          messages: [
            { role: 'system', content: '你是一个技能生成器。只输出有效的 JSON。' },
            { role: 'user', content: prompt }
          ],
          stream: false
        })
      });
      
      if(!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText.substring(0, 200) });
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // 解析 JSON
      let skillData;
      try {
        // 尝试从响应中提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if(jsonMatch) {
          skillData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found');
        }
      } catch(e) {
        // 如果解析失败，使用原始内容
        skillData = {
          name: '新技能',
          description: description,
          content: content
        };
      }
      
      // 生成唯一 ID
      const skillId = skillData.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') + '_' + Date.now();
      
      // 保存技能文件
      ensureSkillsDir();
      const filePath = path.join(SKILLS_DIR, skillId + '.json');
      fs.writeFileSync(filePath, JSON.stringify(skillData, null, 2));
      
      res.json({ success: true, id: skillId, skill: skillData });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });



  // WebSocket 连接
  io.on('connection', (socket) => {
    console.log(`[Yicalw] Web 客户端连接: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`[Yicalw] Web 客户端断开: ${socket.id}`);
    });

    // 发送消息到 agent
    socket.on('message', async (msg) => {
      try {
        const agent = require('./agent');
        const result = await agent.process(msg, io);
        io.emit('response', { message: result });
      } catch (e) {
        io.emit('error', { error: e.message });
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Yicalw] Web 控制台: http://localhost:${port}`);
  }).on('error', (err) => {
    console.error('[Yicalw] 服务器启动失败:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error('端口', port, '已被占用，请关闭相关进程后重试');
    }
  });

  return io;
}

function stop() {
  if (serverInstance) {
    serverInstance.close();
    console.log('[Yicalw] Web 服务器已关闭');
  }
}

function getIO() {
  return ioInstance;
}

module.exports = { start, stop, getIO };

// 启动服务器
if (require.main === module) {
  start();
}
