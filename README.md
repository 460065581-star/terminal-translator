# Terminal Translator 🌐

命令行实时翻译助手 — 在终端里敲命令，自动把英文输出翻译成中文。

![Electron](https://img.shields.io/badge/Electron-40-blue) ![DeepSeek](https://img.shields.io/badge/DeepSeek-API-green)

## 功能

- 上半部分：真实终端（xterm.js），正常操作
- 下半部分：实时显示翻译结果
- 流式翻译（DeepSeek API SSE streaming）
- 智能缓冲：按时间窗口聚合输出再翻译，避免频繁调用 API
- ANSI 转义码自动清洗
- 进度条/spinner 自动过滤
- 分隔条可拖动调整大小
- Catppuccin Mocha 主题

## 安装

```bash
git clone https://github.com/你的用户名/terminal-translator.git
cd terminal-translator
npm install

# node-pty 需要针对 Electron 重新编译
npx node-gyp rebuild --target=40.6.1 --arch=x64 --dist-url=https://electronjs.org/headers
```

> 国内用户如果 Electron 下载慢，可以用淘宝镜像：
> ```bash
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install electron
> ```

## 使用

```bash
npm start
```

首次启动需要输入 DeepSeek API Key（[申请地址](https://platform.deepseek.com/)）。

## macOS 自动启动

在 `~/.zshrc` 中添加：

```bash
if ! pgrep -f "electron.*terminal-translator" >/dev/null 2>&1; then
  /path/to/terminal-translator/start.sh >/dev/null 2>&1
fi
```

## 技术栈

- **Electron** — 桌面窗口
- **node-pty** — 伪终端
- **xterm.js** — 终端渲染
- **DeepSeek API** — 流式翻译

## License

MIT
