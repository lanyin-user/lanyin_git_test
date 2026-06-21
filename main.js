/**
 * Yicalw - 轻量级本地 AI 智能体
 * 主入口文件
 */

const path = require('path');
const fs = require('fs');
const config = require('./config');
const agent = require('./agent');
const server = require('./server');
const scheduler = require('./scheduler');

// 设置工作目录
const workDir = config.getWorkDir();
if (workDir) {
  process.chdir(workDir);
  console.log(`[Yicalw] 工作目录: ${workDir}`);
}

console.log(`[Yicalw] 启动中...`);
console.log(`[Yicalw] 模型: ${config.getDefaultModelName()}`);

// 启动定时任务调度器
scheduler.start();

// 启动 Web 服务器
const io = server.start(config.getWebPort());

// 启动 CLI 交互
if (!process.argv.includes('--no-console')) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n[Yicalw] 就绪！输入消息开始对话，输入 "help" 查看命令。\n');

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('[Yicalw] 再见！');
      rl.close();
      process.exit(0);
      return;
    }

    if (trimmed === 'help') {
      console.log(`
可用命令:
  help        - 显示帮助
  exit        - 退出程序
  clear       - 清空对话历史
  config      - 查看当前配置
  tasks       - 查看定时任务
  memory      - 查看记忆
  models      - 切换模型
  
  直接输入消息即可对话。
`);
      return;
    }

    if (trimmed === 'clear') {
      agent.clearHistory();
      console.log('[Yicalw] 对话历史已清空。');
      return;
    }

    if (trimmed === 'config') {
      console.log(`配置: ${JSON.stringify(config.getConfig(), null, 2)}`);
      return;
    }

    if (trimmed === 'tasks') {
      const tasks = scheduler.listTasks();
      if (tasks.length === 0) {
        console.log('[Yicalw] 暂无定时任务。');
      } else {
        console.log(`当前有 ${tasks.length} 个任务:`);
        tasks.forEach(t => console.log(`  - [${t.id}] ${t.intent} (${t.status})`));
      }
      return;
    }

    if (trimmed === 'memory') {
      const mem = agent.getMemories();
      if (mem.length === 0) {
        console.log('[Yicalw] 暂无记忆。');
      } else {
        console.log(`共有 ${mem.length} 条记忆:`);
        mem.forEach(m => console.log(`  - ${m.content}`));
      }
      return;
    }

    if (trimmed.startsWith('models ') || trimmed === 'models') {
      config.showModels();
      return;
    }

    // 普通对话
    const result = await agent.process(trimmed, io);
    console.log(result);
  });
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[Yicalw] 正在关闭...');
  scheduler.stop();
  server.stop();
  process.exit(0);
});
