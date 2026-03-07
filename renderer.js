/* global Terminal, FitAddon, terminalAPI */

// ── State ──
let preset = 'deepseek';
let apiKey = '';
let apiBase = '';
let modelName = '';
let outputBuffer = '';
let bufferTimer = null;
const BUFFER_DELAY = 800; // ms before flushing to translate
let translating = false;
let translateQueue = [];
let paused = false;
let _configCache = {};

// ── Model Presets ──
const PRESETS = {
  deepseek:  { base: 'https://api.deepseek.com', model: 'deepseek-chat', placeholder: 'sk-...' },
  openai:    { base: 'https://api.openai.com', model: 'gpt-4o-mini', placeholder: 'sk-...' },
  kimi:      { base: 'https://api.moonshot.cn', model: 'moonshot-v1-8k', placeholder: 'sk-...' },
  qwen:      { base: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-turbo', placeholder: 'sk-...' },
  ollama:    { base: 'http://localhost:11434', model: 'qwen2.5:7b', placeholder: '不需要填写' },
  custom:    { base: '', model: '', placeholder: 'API Key' },
};

// Load saved config for current preset (from file)
function loadPresetConfig(p) {
  const defaults = PRESETS[p] || PRESETS.custom;
  const saved = _configCache.keys || {};
  apiKey = (saved[p] && saved[p].key) || '';
  apiBase = (saved[p] && saved[p].base) || defaults.base;
  modelName = (saved[p] && saved[p].model) || defaults.model;
}

async function savePresetConfig(p) {
  if (!_configCache.keys) _configCache.keys = {};
  _configCache.keys[p] = { key: apiKey, base: apiBase, model: modelName };
  _configCache.preset = p;
  await terminalAPI.writeConfig(_configCache);
}

// Init: load config from file, then proceed
async function initConfig() {
  _configCache = await terminalAPI.readConfig() || {};
  preset = _configCache.preset || 'deepseek';
  loadPresetConfig(preset);
}

// ── Terminal Setup ──
const term = new Terminal({
  fontSize: 14,
  fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
  theme: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  cursorBlink: true,
  allowProposedApi: true,
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

// ── Command Tracking ──
let inputBuffer = '';
let lastCommand = '';

// ── Terminal I/O ──
term.onData((data) => {
  terminalAPI.sendInput(data);
  // Track user input to detect commands
  if (data === '\r' || data === '\n') {
    const cmd = inputBuffer.trim();
    if (cmd) lastCommand = cmd;
    inputBuffer = '';
  } else if (data === '\x7f') {
    // backspace
    inputBuffer = inputBuffer.slice(0, -1);
  } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
    inputBuffer += data;
  }
});

terminalAPI.onData((data) => {
  term.write(data);
  bufferOutput(data);
});

terminalAPI.onExit((code) => {
  term.write(`\r\n[进程已退出，代码: ${code}]\r\n`);
});

// ── Resize ──
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  terminalAPI.resize(term.cols, term.rows);
});
resizeObserver.observe(document.getElementById('terminal-container'));

// ── Divider Drag ──
const divider = document.getElementById('divider');
const panel = document.getElementById('translate-panel');
let dragging = false;

divider.addEventListener('mousedown', () => { dragging = true; });
document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const newHeight = window.innerHeight - e.clientY - 3;
  panel.style.height = Math.max(80, Math.min(newHeight, window.innerHeight - 150)) + 'px';
  fitAddon.fit();
  terminalAPI.resize(term.cols, term.rows);
});
document.addEventListener('mouseup', () => { dragging = false; });

// ── API Config ──
const configDialog = document.getElementById('api-config');
const apiKeyInput = document.getElementById('api-key-input');
const apiBaseInput = document.getElementById('api-base-input');
const apiModelInput = document.getElementById('api-model-input');
const apiPresetSelect = document.getElementById('api-preset');
const apiSaveBtn = document.getElementById('api-save-btn');

// Preset change handler — load saved key for that preset
apiPresetSelect.addEventListener('change', () => {
  const p = apiPresetSelect.value;
  const saved = _configCache.keys || {};
  const defaults = PRESETS[p] || PRESETS.custom;
  apiKeyInput.value = (saved[p] && saved[p].key) || '';
  apiBaseInput.value = (saved[p] && saved[p].base) || defaults.base;
  apiModelInput.value = (saved[p] && saved[p].model) || defaults.model;
  apiKeyInput.placeholder = defaults.placeholder;
});

// Init config from file then update UI
initConfig().then(() => {
  if (apiKey || preset === 'ollama') {
    configDialog.classList.add('hidden');
  }
  apiKeyInput.value = apiKey;
  apiBaseInput.value = apiBase;
  apiModelInput.value = modelName;
  apiPresetSelect.value = preset;
  apiKeyInput.placeholder = (PRESETS[preset] || PRESETS.custom).placeholder;
});

apiSaveBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  apiBase = apiBaseInput.value.trim() || 'https://api.deepseek.com';
  modelName = apiModelInput.value.trim() || 'deepseek-chat';
  preset = apiPresetSelect.value;

  // Ollama doesn't need a key
  if (!apiKey && preset !== 'ollama') return;

  savePresetConfig(preset).then(() => {
    configDialog.classList.add('hidden');
    term.focus();
  });
});

// Settings button - reopen config
document.getElementById('settings-btn').addEventListener('click', () => {
  configDialog.classList.remove('hidden');
  apiKeyInput.value = apiKey;
  apiBaseInput.value = apiBase;
  apiModelInput.value = modelName;
  apiPresetSelect.value = preset;
});

// Clear button
document.getElementById('clear-btn').addEventListener('click', () => {
  document.getElementById('translate-content').innerHTML = '';
});

// Pause/Resume button
const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶ 开始' : '⏸ 暂停';
  pauseBtn.title = paused ? '恢复翻译' : '暂停翻译';
  if (paused) pauseBtn.classList.add('active');
  else pauseBtn.classList.remove('active');
  document.getElementById('translate-status').textContent = paused ? '已暂停' : '就绪';
});

// Snap translate (translate current viewport)
document.getElementById('snap-btn').addEventListener('click', () => {
  const buf = term.buffer.active;
  const lines = [];
  const baseY = buf.viewportY;
  for (let i = 0; i < term.rows; i++) {
    const line = buf.getLine(baseY + i);
    if (line) lines.push(line.translateToString(true));
  }
  const text = stripAnsi(lines.join('\n')).replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.length < 2) return;

  // Force translate everything, no classification
  enqueueTranslation(text, 'translate', '');
});

// ── ANSI Strip ──
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''
  );
}

// ── Output Buffer ──
function bufferOutput(data) {
  if (!apiKey && preset !== 'ollama') return;
  if (paused) return;
  outputBuffer += data;
  if (bufferTimer) clearTimeout(bufferTimer);
  bufferTimer = setTimeout(flushBuffer, BUFFER_DELAY);
}

function flushBuffer() {
  bufferTimer = null;
  const raw = outputBuffer;
  outputBuffer = '';

  const cleaned = stripAnsi(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Strip shell prompts (user@host ... % or $ patterns)
    .replace(/\n?\S+@\S+[^%$#]*[%$#]\s*$/gm, '')
    .trim();

  if (!cleaned || cleaned.length < 3) return;

  // Skip progress bars, spinners, single chars
  if (/^[▓░█▏▎▍▌▋▊▉\s\-\\|/=>#.]+$/.test(cleaned)) return;
  if (/^\d+%/.test(cleaned) && cleaned.length < 20) return;

  // Classify content type
  const segments = splitCodeAndText(cleaned);
  const cmd = lastCommand;
  lastCommand = '';

  for (const seg of segments) {
    if (seg.type === 'code') {
      appendSkipped(seg.text, '📝 代码内容，跳过翻译');
    } else {
      const ct = cmd ? 'explain' : 'translate';
      enqueueTranslation(seg.text, ct, cmd);
    }
  }
}

// ── Split mixed code/text output ──
function splitCodeAndText(text) {
  const lines = text.split('\n');
  const segments = [];
  let currentType = null;
  let currentLines = [];

  for (const line of lines) {
    const isCode = isCodeLine(line);
    const type = isCode ? 'code' : 'text';

    if (type !== currentType && currentLines.length > 0) {
      const joined = currentLines.join('\n').trim();
      if (joined) segments.push({ type: currentType, text: joined });
      currentLines = [];
    }
    currentType = type;
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const joined = currentLines.join('\n').trim();
    if (joined) segments.push({ type: currentType, text: joined });
  }

  // Merge tiny text segments (< 3 chars) into neighbors
  return segments.filter(s => s.text.length >= 2);
}

function isCodeLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const patterns = [
    /^\s*<\/?[a-zA-Z][^>]*>\s*$/,
    /^\s*<[a-zA-Z][^>]*>/,
    /^\s*<\/[a-zA-Z]+>/,
    /^\s*<!DOCTYPE/i,
    /^\s*(import |from |export |const |let |var |function |class |def |async |await )/,
    /^\s*(if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{)/,
    /^\s*[{}()\[\]];?\s*$/,
    /^\s*(\/\/|#!|\/\*|\*\/)/,
    /^\s*(return |throw |yield )/,
    /^\s*(print|println|printf|console\.log)\s*\(/,
    /^\s*if\s+__name__\s*==/,
    /^\s*(elif |else:|except |finally:)/,
    /^\s*(public|private|protected|static)\s/,
  ];
  return patterns.some(p => p.test(trimmed));
}

// ── Content Classifier ──
function classifyContent(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return 'skip';

  // Code indicators
  const codePatterns = [
    /^\s*(import |from |export |const |let |var |function |class |def |async |await )/,
    /^\s*(if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\()/,
    /^\s*[{}()\[\]];?\s*$/,
    /^\s*(\/\/|#!|\/\*|\*\/|\*\s)/,
    /^\s*<\/?[a-zA-Z][^>]*>\s*$/,
    /^\s*<[a-zA-Z][^>]*>/,  // lines starting with HTML tags
    /^\s*<\/[a-zA-Z]+>\s*$/,  // closing tags
    /^\s*<!DOCTYPE/i,
    /^\s*(return |throw |yield |=>)/,
    /[{};]\s*$/,
    /^\s*(print|println|printf|console\.log|fmt\.Print)\s*\(/,
    /^\s*if\s+__name__\s*==\s*/,
    /^\s*(elif |else:|except |finally:)/,
    /^\s*\.(then|catch|finally)\(/,
    /^\s*(public|private|protected|static)\s/,
    /^\s*@\w+/,
  ];

  // Claude Code file-write keywords
  const claudeWriteKeywords = [
    /^Write\s+file:/i,
    /^Update\s+file:/i,
    /^Create\s+file:/i,
    /^Edit\s+file:/i,
  ];

  let codeLines = 0;
  let hasWriteKeyword = false;

  for (const line of lines) {
    if (claudeWriteKeywords.some(p => p.test(line))) {
      hasWriteKeyword = true;
    }
    if (codePatterns.some(p => p.test(line))) {
      codeLines++;
    }
  }

  // Only skip when Claude Code is explicitly writing/editing a file
  if (hasWriteKeyword) return 'code';

  // If >50% of lines look like code, skip
  if (lines.length >= 3 && codeLines / lines.length > 0.5) return 'code';

  // Check if it's a simple command output that needs explanation
  const simpleCommandPattern = /^(\/[\w\-./]+\s*$|total\s+\d+|drwx|[-rwx]{10}|\w+\s+\d+\s+\w+\s+\w+\s+\d+)/;
  if (lines.some(l => simpleCommandPattern.test(l.trim()))) return 'explain';

  return 'translate';
}

// ── Skip Display ──
function appendSkipped(text, reason) {
  const contentEl = document.getElementById('translate-content');
  const lineEl = document.createElement('div');
  lineEl.className = 'line';

  const origEl = document.createElement('div');
  origEl.className = 'original';
  origEl.textContent = text.length > 80 ? text.slice(0, 80) + '...' : text;

  const transEl = document.createElement('div');
  transEl.className = 'translated';
  transEl.style.opacity = '0.5';
  transEl.textContent = reason;

  lineEl.appendChild(origEl);
  lineEl.appendChild(transEl);
  contentEl.appendChild(lineEl);
  contentEl.scrollTop = contentEl.scrollHeight;
}

// ── Translation Queue ──
function enqueueTranslation(text, contentType, command) {
  translateQueue.push({ text, contentType, command });
  if (!translating) processQueue();
}

async function processQueue() {
  if (translateQueue.length === 0) {
    translating = false;
    return;
  }
  translating = true;
  const { text, contentType, command } = translateQueue.shift();
  await translateText(text, contentType, command);
  processQueue();
}

// ── DeepSeek API (Streaming) ──
async function translateText(text, contentType, command) {
  const statusEl = document.getElementById('translate-status');
  const contentEl = document.getElementById('translate-content');

  statusEl.textContent = '翻译中...';

  // Create line element
  const lineEl = document.createElement('div');
  lineEl.className = 'line';

  const origEl = document.createElement('div');
  origEl.className = 'original';
  origEl.textContent = text.length > 120 ? text.slice(0, 120) + '...' : text;

  const transEl = document.createElement('div');
  transEl.className = 'translated streaming';

  lineEl.appendChild(origEl);
  lineEl.appendChild(transEl);
  contentEl.appendChild(lineEl);
  contentEl.scrollTop = contentEl.scrollHeight;

  try {
    const systemPrompt = contentType === 'explain'
      ? '你是一个终端教学助手，面向完全不懂编程的小白用户。用户会提供他们输入的命令和终端输出。请：1）先用一句话解释这个命令是做什么的（如"ls 命令用于列出当前文件夹的内容"）2）再用通俗易懂的中文解释输出内容的含义。对于英文文件名和目录名，保留原文并在后面加括号注释中文含义，如 Downloads (下载文件夹)、node_modules (依赖包目录)、package.json (项目配置文件)。命令名保留原文。简洁明了，不要啰嗦。'
      : '你是一个终端输出翻译助手。将用户提供的英文终端输出翻译成简洁的中文。对于英文文件名和目录名，保留原文并在后面加括号注释中文含义，如 Downloads (下载文件夹)、node_modules (依赖包目录)、LICENSE (许可证文件)。命令名保留原文。只输出翻译结果，不要额外解释。如果内容已经是中文，直接原样返回。如果是无意义的输出（如纯符号、空行），回复"—"。';

    const userContent = contentType === 'explain' && command
      ? `命令: ${command}\n输出:\n${text}`
      : text;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        stream: true,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      const hint = {
        401: '🔑 认证失败：可能是 API Key 错误/过期，或者 Key 与选择的模型不匹配。请点击右上角 ⚙️ 检查 Key 和模型预设是否对应',
        403: '🚫 没有权限访问该 API，可能是 Key 没有开通对应模型的权限',
        404: '❓ 找不到该模型：请检查模型名称是否正确，或者你的 API Key 是否有权限使用该模型',
        429: '⏳ 请求太频繁，API 限流了，稍等一会再试',
        500: '💥 API 服务器内部错误，不是你的问题，等一会再试',
        502: '🔌 API 服务暂时不可用，可能在维护中',
        503: '🔌 API 服务暂时不可用，可能在维护中',
      }[resp.status] || `未知错误 (${resp.status})`;
      transEl.textContent = `❌ ${hint}`;
      transEl.classList.remove('streaming');
      statusEl.textContent = `错误 ${resp.status}`;
      console.error('API error:', err);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            result += delta;
            transEl.textContent = result;
            contentEl.scrollTop = contentEl.scrollHeight;
          }
        } catch (e) {
          // skip malformed chunks
        }
      }
    }

    transEl.classList.remove('streaming');
    if (!result.trim()) transEl.textContent = '—';
    statusEl.textContent = '就绪';
  } catch (err) {
    const hint = err.message.includes('fetch')
      ? '无法连接到 API 服务器，请检查网络或 API Base URL 是否正确'
      : err.message;
    transEl.textContent = `❌ 网络错误: ${hint}`;
    transEl.classList.remove('streaming');
    statusEl.textContent = '连接失败';
    console.error('Fetch error:', err);
  }
}

// Focus terminal on load
term.focus();

// Ensure focus on click anywhere
document.getElementById('terminal-container').addEventListener('click', () => term.focus());
document.addEventListener('keydown', () => {
  if (!document.activeElement || document.activeElement === document.body) {
    term.focus();
  }
});
// Re-focus after window regains focus
window.addEventListener('focus', () => term.focus());
