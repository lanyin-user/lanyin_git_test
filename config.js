/**
 * Yicalw - 配置管理
 */

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[Yicalw] 配置文件读取失败:', e.message);
  }
  // 默认配置
  return {
    models: [{ name: 'qwen-plus', apiKey: '', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }],
    webPort: 5050,
    workDir: ''
  };
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Yicalw] 保存配置失败:', e.message);
  }
}

function getConfig() {
  if (!config) config = loadConfig();
  return config;
}

function getDefaultModel() {
  return config.models[0];
}

function getDefaultModelName() {
  return config.models[0]?.name || 'unknown';
}

function getWebPort() {
  return config.webPort || 3000;
}

function getWorkDir() {
  return config.workDir || process.cwd();
}

function showModels() {
  console.log('\n可用模型:');
  config.models.forEach((m, i) => {
    const mark = i === 0 ? ' (默认)' : '';
    console.log(`  ${i + 1}. ${m.name}${mark} - ${m.endpoint}`);
  });
  console.log('\n使用方法: model <编号>  例如: model 2');
}

function switchModel(index) {
  const idx = parseInt(index) - 1;
  if (idx >= 0 && idx < config.models.length) {
    const moved = config.models.splice(idx, 1)[0];
    config.models.unshift(moved);
    saveConfig();
    console.log(`[Yicalw] 已切换到模型: ${moved.name}`);
  } else {
    console.log(`[Yicalw] 无效模型编号，共 ${config.models.length} 个模型。`);
  }
}

function addModel(name, apiKey, endpoint) {
  config.models.push({ name, apiKey, endpoint });
  saveConfig();
  console.log(`[Yicalw] 已添加模型: ${name}`);
}

module.exports = {
  getConfig,
  getDefaultModel,
  getDefaultModelName,
  getWebPort,
  getWorkDir,
  showModels,
  switchModel,
  addModel,
  saveConfig
};
