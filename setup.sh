#!/bin/bash
set -e

echo "🚀 Terminal Translator 安装脚本"
echo "================================"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js，请先安装："
  echo "   brew install node"
  echo "   或访问 https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 版本过低 (需要 >= 18)，当前: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v)"

# Check Xcode Command Line Tools (needed for node-pty)
if ! xcode-select -p &> /dev/null; then
  echo "📦 安装 Xcode Command Line Tools (编译 node-pty 需要)..."
  xcode-select --install
  echo "⏳ 请等待安装完成后重新运行此脚本"
  exit 1
fi
echo "✅ Xcode Command Line Tools"

# Install dependencies
echo ""
echo "📦 安装依赖..."
npm install

# Get Electron version
ELECTRON_VERSION=$(node -e "console.log(require('./node_modules/electron/package.json').version)")
echo "✅ Electron v${ELECTRON_VERSION}"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  TARGET_ARCH="arm64"
else
  TARGET_ARCH="x64"
fi
echo "🖥  架构: ${TARGET_ARCH}"

# Rebuild node-pty for Electron
echo ""
echo "🔧 为 Electron 重新编译 node-pty..."
cd node_modules/node-pty
npx node-gyp rebuild \
  --target="${ELECTRON_VERSION}" \
  --arch="${TARGET_ARCH}" \
  --dist-url=https://electronjs.org/headers \
  2>&1 | tail -3
cd ../..

echo ""
echo "✅ 安装完成！"
echo ""
echo "启动方式："
echo "  npm start"
echo ""
echo "首次启动会弹出 API 配置窗口，填入你的 API Key 即可使用。"
echo "支持 DeepSeek / OpenAI / Kimi / 通义千问 / Ollama 等模型。"
