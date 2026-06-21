/**
 * Yicalw - AI 代理核心
 * 处理对话、工具调用、记忆管理
 */

const OpenAI = require('openai');
const config = require('./config');
const tools = require('./tools');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// 对话历史
let conversationHistory = [];

// 记忆存储
let memories = loadMemories();

function loadMemories() {
  try {
    const p = path.join(DATA_DIR, 'memory.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) { }
  return [];
}

function saveMemories() {
  fs.writeFileSync(path.join(DATA_DIR, 'memory.json'), JSON.stringify(memories, null, 2));
}

function addMemory(content) {
  memories.push({ id: Date.now().toString(), content, created: new Date().toISOString() });
  saveMemories();
  return `记忆已保存: "${content}"`;
}

function recallMemory(query) {
  // 简单关键词匹配，后续可扩展为向量检索
  const results = memories.filter(m =>
    m.content.toLowerCase().includes(query.toLowerCase())
  );
  if (results.length === 0) {
    return '未找到相关记忆。';
  }
  return results.map(r => `• ${r.content}`).join('\n');
}

function getMemories() {
  return memories;
}

function clearHistory() {
  conversationHistory = [];
}

// 系统提示词
const SYSTEM_PROMPT = `你是一个名为 Yicalw 的本地 AI 智能体。你能帮助用户执行各种任务。

## 能力
- 执行终端命令（查看系统信息、运行脚本、管理文件等）
- 读写文件（代码、配置、文档等）
- 搜索文件内容
- 管理定时任务
- 记住重要信息
- 分析图片内容
- 生成视频（文字转视频）

## 规则
- 用中文回答，除非用户要求用其他语言
- 执行命令时要小心，不要破坏系统
- 写文件时确保路径正确
- 如果不确定，先询问用户
- 工具调用时严格按照参数格式

## 定时任务说明
- 当你需要添加定时任务时，使用 add_scheduled_task 工具
- 不要自己模拟定时器，让系统调度器处理
- 任务执行时，系统会自动调用你，你直接执行即可

## 记忆系统
- 当用户要求记住信息时使用 save_memory 工具
- 当需要回忆过往信息时使用 recall_memory 工具

## 视频生成说明
- 当用户要求生成视频时，使用 generate_video 工具
- 视频生成需要一定时间（通常1-3分钟），请耐心等待
- 生成完成后会返回视频URL
- 如果用户没有指定模型，使用默认的通义万相模型
- 可以建议用户使用更详细的描述来获得更好的效果`;

// 工具定义（Function Calling）
const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: '执行终端命令。前台命令用于需要等待结果的任务（如运行脚本、编译），后台命令用于不会退出的任务（如启动服务器、浏览器）。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          background: { type: 'boolean', description: '是否后台运行（true=后台，false=前台等待结果）' }
        },
        required: ['command', 'background']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容。如需修改已有文件，使用 replace 模式并提供 old_text。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '写入的内容' },
          mode: { type: 'string', enum: ['overwrite', 'replace'], description: 'overwrite=覆盖整个文件, replace=替换指定文本' },
          old_text: { type: 'string', description: 'mode=replace 时，要替换的原文本' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在目录中搜索包含关键字的文件',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键字' },
          dir: { type: 'string', description: '搜索目录，默认为当前目录' },
          pattern: { type: 'string', description: '文件匹配模式，如 "*.js"' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_scheduled_task',
      description: '添加定时任务。系统会自动在指定时间执行。',
      parameters: {
        type: 'object',
        properties: {
          execute_at: { type: 'string', description: '执行时间，ISO 8601 格式，如 2026-06-20T15:00:00+08:00' },
          intent: { type: 'string', description: '任务描述，到达时间时你将执行此任务' },
          interval_minutes: { type: 'integer', description: '周期间隔（分钟），0 表示只执行一次' }
        },
        required: ['execute_at', 'intent']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_scheduled_task',
      description: '删除定时任务',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务 ID' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: '保存记忆。当用户要求记住重要信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要记住的内容' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: '回忆记忆。当需要查找之前记住的信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键字' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_image',
      description: '读取并分析本地图片',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '图片文件路径' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认为当前目录' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: '根据文字描述生成视频。适合需要创建短视频内容的场景。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频描述，越详细越好，包括场景、动作、风格等' },
          duration: { type: 'integer', description: '视频时长(秒)，默认5，最多10秒' },
          ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: '视频比例，默认16:9' },
          model_id: { type: 'string', description: '使用的视频模型ID，如 dashscope-wanx2.1' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_video_models',
      description: '列出所有可用的视频生成模型及其配置信息',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_video_model',
      description: '切换默认的视频生成模型',
      parameters: {
        type: 'object',
        properties: {
          model_id: { type: 'string', description: '要切换到的模型ID' }
        },
        required: ['model_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_video_progress',
      description: '检查视频生成任务的进度',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '视频生成任务的ID' }
        },
        required: ['task_id']
      }
    }
  }
];

// 工具执行器
const toolExecutor = {
  async execute_command(args, extras) {
    return require('./tools').execCommand(args.command, args.background, extras);
  },
  async read_file(args) {
    return require('./tools').readFile(args.path);
  },
  async write_file(args) {
    return require('./tools').writeFile(args.path, args.content, args.mode, args.old_text);
  },
  async search_files(args) {
    return require('./tools').searchFiles(args.keyword, args.dir, args.pattern);
  },
  async add_scheduled_task(args) {
    return require('./scheduler').addTask(args.execute_at, args.intent, args.interval_minutes || 0);
  },
  async remove_scheduled_task(args) {
    return require('./scheduler').removeTask(args.task_id);
  },
  async save_memory(args) {
    return addMemory(args.content);
  },
  async recall_memory(args) {
    return recallMemory(args.query);
  },
  async read_image(args) {
    return require('./tools').readImage(args.path);
  },
  async list_directory(args) {
    return require('./tools').listDir(args.path);
  },
  async generate_video(args) {
    const videoGen = require('./video-generator');
    const result = videoGen.createTask(args.prompt, {
      duration: args.duration,
      ratio: args.ratio,
      modelId: args.model_id
    });
    
    if (!result.success) {
      return `❌ ${result.error}`;
    }
    
    return `✅ ${result.message}\n📋 任务ID: ${result.taskId}\n\n💡 提示：生成需要1-3分钟，可通过任务ID查询进度。`;
  },
  async list_video_models(args) {
    const videoGen = require('./video-generator');
    const models = videoGen.listModels();
    
    if (models.length === 0) {
      return '❌ 没有配置视频生成模型，请在设置中添加。';
    }
    
    const list = models.map(m => {
      const def = m.isDefault ? ' (默认)' : '';
      return `• ${m.name}${def} [${m.id}]\n  提供商: ${m.provider} | 最大时长: ${m.maxDuration}s | 质量: ${m.quality}`;
    }).join('\n\n');
    
    return `📋 可用视频模型:\n\n${list}`;
  },
  async switch_video_model(args) {
    const videoGen = require('./video-generator');
    const result = videoGen.switchModel(args.model_id);
    
    if (!result.success) {
      return `❌ ${result.error}`;
    }
    
    return `✅ 已切换到模型: ${result.name}`;
  },
  async check_video_progress(args) {
    const videoGen = require('./video-generator');
    const result = videoGen.getProgress(args.task_id);
    
    if (!result.success) {
      return `❌ ${result.error}`;
    }
    
    let output = `📋 任务进度:\n`;
    output += `  状态: ${result.status}\n`;
    output += `  进度: ${result.progress}%\n`;
    output += `  提示: ${result.message}\n`;
    
    if (result.status === 'completed' && result.videoUrl) {
      output += `\n✅ 视频生成完成！\n🔗 视频URL: ${result.videoUrl}\n`;
      if (result.thumbnailUrl) {
        output += `🖼️ 缩略图: ${result.thumbnailUrl}\n`;
      }
      if (result.downloadPath) {
        output += `💾 下载路径: ${result.downloadPath}\n`;
      }
    } else if (result.status === 'failed') {
      output += `\n❌ 生成失败: ${result.error}\n`;
    }
    
    return output;
  }
};

// 与 AI 模型交互（参考 PiPiClaw 的实现方式）
async function callLLM(messages, toolsToUse) {
  const model = config.getDefaultModel();
  
  const url = model.endpoint.endsWith('/chat/completions') 
    ? model.endpoint 
    : model.endpoint + '/chat/completions';

  const body = {
    model: model.name,
    messages: messages,
    stream: false
  };

  if (toolsToUse && toolsToUse.length > 0) {
    body.tools = toolsToUse;
    body.tool_choice = 'auto';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + model.apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Yicalw] API 错误:', response.status, errorText);
      return {
        content: '❌ API 错误 ' + response.status + ': ' + errorText.substring(0, 100),
        toolCalls: [],
        hasToolCall: false
      };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    if (!choice) {
      console.error('[Yicalw] LLM 返回空响应:', JSON.stringify(data));
      return { 
        content: '(无响应内容)', 
        toolCalls: [], 
        hasToolCall: false 
      };
    }

    const content = choice.message?.content || '';
    const toolCalls = choice.message?.tool_calls || [];
    
    console.log('[Yicalw] LLM 响应:', {
      hasContent: !!content,
      contentLength: content.length,
      toolCallCount: toolCalls.length
    });
    
    return {
      content: content || '(无内容)',
      toolCalls: toolCalls,
      hasToolCall: toolCalls && toolCalls.length > 0
    };
  } catch (e) {
    console.error('[Yicalw] LLM 调用失败:', e.message, e.stack);
    return {
      content: '❌ API 调用失败: ' + e.message,
      toolCalls: [],
      hasToolCall: false
    };
  }
}

// 处理用户消息
async function processUserMessage(input, io) {
  console.log('[Agent] 处理输入:', input);
  
  // 添加用户消息到历史
  conversationHistory.push({ role: 'user', content: input });

  // 控制上下文长度
  const maxMessages = 50;
  if (conversationHistory.length > maxMessages) {
    conversationHistory = conversationHistory.slice(-maxMessages);
  }

  // 构建完整消息列表
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory
  ];

  // 发送初始思考步骤
  io?.emit('thinking_step', { step: '💭 正在理解你的问题...' });
  
  // 调用 AI
  const result = await callLLM(messages, TOOL_DEFS);
  
  console.log('[Agent] callLLM 返回:', JSON.stringify(result, null, 2));

  let output = '';
  let thinkingSteps = [];

  if (result.hasToolCall && result.toolCalls && result.toolCalls.length > 0) {
    console.log('[Agent] 检测到工具调用');
    thinkingSteps.push('🔍 分析问题，准备调用工具...');
    io?.emit('thinking_step', { step: thinkingSteps[thinkingSteps.length - 1] });
    
    // 处理工具调用...
    const toolMessages = [...messages];
    
    toolMessages.push({
      role: 'assistant',
      tool_calls: result.toolCalls
    });

    for (const tc of result.toolCalls) {
      try {
        const args = JSON.parse(tc.function?.arguments || '{}');
        const executor = toolExecutor[tc.function?.name];
        
        if (executor) {
          io?.emit('tool_start', { tool: tc.function.name, args });
          const toolResult = await executor(args, { io });
          io?.emit('tool_result', { tool: tc.function.name, result: toolResult });

          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult
          });

          output += `🔧 [${tc.function.name}]: ${toolResult}\n`;
          thinkingSteps.push(`✅ 执行 ${tc.function.name}: ${toolResult.substring(0, 50)}...`);
          io?.emit('thinking_step', { step: thinkingSteps[thinkingSteps.length - 1] });
        } else {
          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `工具 ${tc.function?.name} 未实现`
          });
        }
      } catch (e) {
        toolMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `执行出错: ${e.message}`
        });
        output += `❌ 工具执行出错: ${e.message}\n`;
        thinkingSteps.push(`❌ 工具执行失败: ${e.message}`);
        io?.emit('thinking_step', { step: thinkingSteps[thinkingSteps.length - 1] });
      }
    }

    thinkingSteps.push('🤔 整合信息，生成最终回复...');
    io?.emit('thinking_step', { step: thinkingSteps[thinkingSteps.length - 1] });
    
    const finalResult = await callLLM(toolMessages, []);
    output += finalResult.content;
    
    conversationHistory.push({ role: 'assistant', content: finalResult.content });
  } else {
    console.log('[Agent] 无工具调用，直接返回 content');
    thinkingSteps.push('💭 正在思考如何回答...');
    io?.emit('thinking_step', { step: thinkingSteps[thinkingSteps.length - 1] });
    
    output = result.content;
    conversationHistory.push({ role: 'assistant', content: result.content });
  }

  console.log('[Agent] 最终输出:', output);
  return { 
    output: output, 
    thinkingSteps: thinkingSteps,
    currentStep: thinkingSteps[thinkingSteps.length - 1] || '正在处理...'
  };
}

module.exports = {
  process: processUserMessage,
  clearHistory,
  getMemories,
  addMemory,
  recallMemory
};
