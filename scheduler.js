/**
 * Yicalw - 定时任务调度器
 */

const fs = require('fs');
const path = require('path');
const agent = require('./agent');

const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

let tasks = [];
let timerInterval = null;

function loadTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    }
  } catch (e) {
    tasks = [];
  }
}

function saveTasks() {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Yicalw] 保存任务失败:', e.message);
  }
}

loadTasks();

// 添加任务
function addTask(executeAt, intent, intervalMinutes = 0) {
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    executeAt,
    intent,
    intervalMinutes,
    status: 'pending',
    created: new Date().toISOString()
  };

  tasks.push(task);
  saveTasks();

  const nextTime = new Date(executeAt).toLocaleString('zh-CN');
  return `✅ 定时任务已添加: [${task.id}]\n时间: ${nextTime}\n任务: ${intent}`;
}

// 删除任务
function removeTask(taskId) {
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) {
    return `❌ 未找到任务: ${taskId}`;
  }
  tasks.splice(idx, 1);
  saveTasks();
  return `✅ 任务已删除: ${taskId}`;
}

// 列出任务
function listTasks() {
  return tasks;
}

// 调度器主循环
function start() {
  timerInterval = setInterval(() => {
    const now = new Date();
    
    tasks.forEach(task => {
      if (task.status !== 'pending') return;
      
      const executeTime = new Date(task.executeAt);
      if (now >= executeTime) {
        // 执行任务
        task.status = 'running';
        saveTasks();

        // 异步执行，不阻塞调度器
        setTimeout(async () => {
          try {
            // 将任务意图作为用户消息发给 agent
            const message = `[定时任务触发] 请执行以下任务: ${task.intent}`;
            const result = await agent.process(message);
            console.log(`[Yicalw] 定时任务 [${task.id}] 完成: ${result.substring(0, 100)}`);
            
            task.status = 'done';
            
            // 如果是周期任务，重新安排
            if (task.intervalMinutes > 0) {
              const nextTime = new Date(now.getTime() + task.intervalMinutes * 60000);
              task.executeAt = nextTime.toISOString();
              task.status = 'pending';
              console.log(`[Yicalw] 周期任务 [${task.id}] 下次执行: ${nextTime.toLocaleString('zh-CN')}`);
            } else {
              // 单次任务，移除
              const idx = tasks.indexOf(task);
              if (idx > -1) tasks.splice(idx, 1);
            }
            
            saveTasks();
          } catch (e) {
            task.status = 'error';
            console.error(`[Yicalw] 定时任务 [${task.id}] 执行失败: ${e.message}`);
            saveTasks();
          }
        }, 0);
      }
    });
  }, 5000); // 每 5 秒检查一次

  console.log('[Yicalw] 定时任务调度器已启动 (检查间隔: 5秒)');
}

function stop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    console.log('[Yicalw] 定时任务调度器已停止');
  }
}

module.exports = {
  start,
  stop,
  addTask,
  removeTask,
  listTasks
};
