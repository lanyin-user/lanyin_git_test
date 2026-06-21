# Yicalw - 轻量级本地 AI 智能体

模拟PiPiClaw Python 风格 AI 助手（Node.js 实现）。

## 功能

- **对话交互** — CLI + Web 双模式
- **工具调用** — 命令执行、文件读写、搜索、图片分析
- **定时任务** — 单次/周期任务调度
- **记忆系统** — 保存和回忆重要信息
- **Web 控制台** — 响应式设计，实时状态面板
- **多模型支持** — OpenAI 兼容接口

## 快速开始

```bash
cd F:\code\yicalw
npm install
node main.js
```

首次运行后编辑 `config.json` 填入 API Key。

## 配置

编辑 `config.json`:

```json
{
  "models": [
    {
      "name": "qwen-plus",
      "apiKey": "你的API密钥",
      "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1"
    }
  ],
  "webPort": 5050,
  "workDir": ""
}
```

## Web 控制台

启动后访问 http://localhost:5050

## CLI 命令

```
help        - 显示帮助
exit        - 退出
clear       - 清空对话
config      - 查看配置
tasks       - 查看任务
memory      - 查看记忆
models      - 切换模型
```

## 与 PiPiClaw 的区别

| 特性 | PiPiClaw | Yicalw |
|------|----------|--------|
| 语言 | C# / .NET | Node.js |
| 启动方式 | AOT 单文件 | npm 安装即可 |
| Web UI | 基础版 | 现代化设计，实时推送 |
| 工具调用 | 静态定义 | 动态扩展 |
| 记忆系统 | 关键词匹配 | 可扩展向量检索 |
| 定时任务 | JSON 文件 | 实时调度 + Web 管理 |
| 体积 | ~2MB | ~15-20MB (含依赖) |
