/**
 * Yicalw - 工具集
 * 文件操作、命令执行、搜索等
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const glob = require('glob');
const util = require('util');

const execAsync = util.promisify(exec);

// 执行命令
async function execCommand(command, background, extras) {
  if (background) {
    // 后台执行
    const child = spawn(command, [], {
      shell: true,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    return `✅ 命令已在后台启动: ${command} (PID: ${child.pid})`;
  } else {
    // 前台执行，等待结果
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 10 // 10MB
      });
      const output = stdout || stderr || '(无输出)';
      return `✅ 命令执行完成:\n${output}`;
    } catch (e) {
      return `❌ 命令执行失败:\n${e.message}`;
    }
  }
}

// 读取文件
function readFile(filePath) {
  try {
    // 尝试多种编码
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      content = fs.readFileSync(filePath, 'gbk');
    }
    
    // 截断过大的文件
    const maxLen = 10000;
    if (content.length > maxLen) {
      return `文件较大 (${content.length} 字符)，只显示前 ${maxLen} 字符:\n\n${content.substring(0, maxLen)}...\n\n(使用 list_directory 查看文件大小)`;
    }
    
    return `📄 文件内容 (${filePath}):\n\n${content}`;
  } catch (e) {
    return `❌ 读取文件失败: ${e.message}`;
  }
}

// 写入文件
function writeFile(filePath, content, mode, oldText) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (mode === 'replace' && oldText) {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (!existing.includes(oldText)) {
        return `❌ 未找到要替换的文本: "${oldText.substring(0, 50)}..."`;
      }
      const newContent = existing.replace(oldText, content);
      fs.writeFileSync(filePath, newContent, 'utf-8');
      return `✅ 文件已修改: ${filePath} (替换文本)`;
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      return `✅ 文件已写入: ${filePath} (${content.length} 字符)`;
    }
  } catch (e) {
    return `❌ 写入文件失败: ${e.message}`;
  }
}

// 搜索文件内容
function searchFiles(keyword, dir = '.', pattern = '*') {
  try {
    const searchDir = path.resolve(dir);
    if (!fs.existsSync(searchDir)) {
      return `❌ 目录不存在: ${dir}`;
    }

    const files = glob.sync(path.join(searchDir, '**', pattern), {
      nodir: true,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    });

    const results = [];
    for (const file of files) {
      try {
        let content;
        try {
          content = fs.readFileSync(file, 'utf-8');
        } catch {
          content = fs.readFileSync(file, 'gbk');
        }
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          results.push(file);
        }
      } catch {
        // 跳过二进制文件
      }
    }

    if (results.length === 0) {
      return `🔍 未找到包含 "${keyword}" 的文件。`;
    }
    
    return `🔍 找到 ${results.length} 个匹配文件:\n${results.map(f => `  • ${f}`).join('\n')}`;
  } catch (e) {
    return `❌ 搜索失败: ${e.message}`;
  }
}

// 读取图片
function readImage(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    return `🖼️ 图片信息: ${filePath} (${sizeKB} KB)`;
  } catch (e) {
    return `❌ 读取图片失败: ${e.message}`;
  }
}

// 列出目录
function listDir(dirPath = '.') {
  try {
    const dir = path.resolve(dirPath);
    if (!fs.existsSync(dir)) {
      return `❌ 目录不存在: ${dirPath}`;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries.map(e => {
      const icon = e.isDirectory() ? '📁' : '📄';
      const size = e.isFile() ? ` (${(e.size / 1024).toFixed(1)}KB)` : '';
      return `${icon} ${e.name}${size}`;
    });

    return `📂 ${dir}:\n${items.join('\n')}`;
  } catch (e) {
    return `❌ 列出目录失败: ${e.message}`;
  }
}

module.exports = {
  execCommand,
  readFile,
  writeFile,
  searchFiles,
  readImage,
  listDir
};
