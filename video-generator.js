/**
 * Yicalw - 视频生成管理器
 * - 多模型支持
 * - 异步任务管理
 * - 进度追踪
 * - 下载管理
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const VIDEO_DIR = path.join(__dirname, 'data', 'videos');
const TASKS_FILE = path.join(VIDEO_DIR, 'tasks.json');

// 确保目录存在
function ensureDirs() {
  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
  }
}

// 加载任务列表
function loadTasks() {
  try {
    ensureDirs();
    const data = fs.readFileSync(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// 保存任务列表
function saveTasks(tasks) {
  ensureDirs();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// 根据 taskId 查找任务
function findTask(taskId) {
  const tasks = loadTasks();
  return tasks.find(t => t.taskId === taskId);
}

// 更新任务
function updateTask(taskId, updates) {
  const tasks = loadTasks();
  const index = tasks.findIndex(t => t.taskId === taskId);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...updates };
    saveTasks(tasks);
    return tasks[index];
  }
  return null;
}

// 生成唯一 taskId
function generateTaskId() {
  return `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 获取默认视频模型
function getDefaultVideoModel() {
  const cfg = config.getConfig();
  const models = cfg.videoModels || [];
  if (models.length === 0) return null;
  return models.find(m => m.isDefault) || models[0];
}

// 列出可用视频模型
function listModels() {
  const cfg = config.getConfig();
  const models = cfg.videoModels || [];
  return models.map(m => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    maxDuration: m.maxDuration,
    quality: m.quality,
    isDefault: m.isDefault || false
  }));
}

// 切换默认模型
function switchModel(modelId) {
  const cfg = config.getConfig();
  const models = cfg.videoModels || [];
  const model = models.find(m => m.id === modelId);
  if (!model) {
    return { success: false, error: '模型不存在' };
  }
  
  models.forEach(m => m.isDefault = (m.id === modelId));
  config.saveConfig(cfg);
  
  return { success: true, name: model.name };
}

// 创建视频生成任务
function createTask(prompt, options = {}) {
  const model = options.modelId 
    ? (config.getConfig().videoModels || []).find(m => m.id === options.modelId)
    : getDefaultVideoModel();
  
  if (!model) {
    return {
      success: false,
      error: '没有可用的视频模型，请先在设置中配置视频生成API'
    };
  }

  const taskId = generateTaskId();
  const task = {
    taskId,
    prompt,
    modelId: model.id,
    modelName: model.name,
    provider: model.provider,
    duration: options.duration || 5,
    ratio: options.ratio || '16:9',
    status: 'pending',
    progress: 0,
    message: '等待生成...',
    videoUrl: null,
    thumbnailUrl: null,
    downloadPath: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  const tasks = loadTasks();
  tasks.unshift(task);
  saveTasks(tasks);

  return {
    success: true,
    taskId,
    model: model.name,
    message: `🎬 视频生成任务已创建\n📋 模型: ${model.name}\n⏱️ 预计时间: 1-3分钟\n💡 可通过 taskId 查询进度`
  };
}

// 获取任务进度
function getProgress(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return { success: false, error: '任务不存在' };
  }
  return {
    success: true,
    ...task
  };
}

// 获取所有任务
function listAllTasks() {
  const tasks = loadTasks();
  return tasks.map(t => ({
    taskId: t.taskId,
    prompt: t.prompt,
    model: t.modelName,
    status: t.status,
    progress: t.progress,
    createdAt: t.createdAt,
    videoUrl: t.videoUrl,
    error: t.error
  }));
}

// 删除任务
function deleteTask(taskId) {
  const tasks = loadTasks();
  const index = tasks.findIndex(t => t.taskId === taskId);
  if (index !== -1) {
    tasks.splice(index, 1);
    saveTasks(tasks);
    return { success: true };
  }
  return { success: false, error: '任务不存在' };
}

// 更新任务进度
function updateProgress(taskId, progress, message) {
  return updateTask(taskId, { progress, message, status: progress >= 100 ? 'completed' : 'generating' });
}

// 标记任务完成
function markCompleted(taskId, videoUrl, thumbnailUrl, downloadPath) {
  return updateTask(taskId, {
    status: 'completed',
    progress: 100,
    message: '生成完成',
    videoUrl,
    thumbnailUrl,
    downloadPath,
    completedAt: new Date().toISOString()
  });
}

// 标记任务失败
function markFailed(taskId, error) {
  return updateTask(taskId, {
    status: 'failed',
    progress: 0,
    message: '生成失败',
    error: error.message || String(error),
    completedAt: new Date().toISOString()
  });
}

// 清理旧任务（保留最近7天）
function cleanupOldTasks(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const tasks = loadTasks();
  const before = tasks.length;
  const filtered = tasks.filter(t => {
    const created = new Date(t.createdAt);
    return created >= cutoff;
  });
  
  if (filtered.length !== before) {
    saveTasks(filtered);
  }
  
  return { removed: before - filtered.length, remaining: filtered.length };
}

module.exports = {
  createTask,
  getProgress,
  listAllTasks,
  deleteTask,
  listModels,
  switchModel,
  updateProgress,
  markCompleted,
  markFailed,
  cleanupOldTasks,
  getDefaultVideoModel,
  generateTaskId,
  VIDEO_DIR,
  TASKS_FILE
};
