/* global Terminal, FitAddon, terminalAPI */

// ── State ──
let apiKey = localStorage.getItem('deepseek_api_key') || '';
let apiBase = localStorage.getItem('deepseek_api_base') || 'https://api.deepseek.com';
let outputBuffer = '';
let bufferTimer = null;
const BUFFER_DELAY = 400; // ms before flushing to translate
let translating = false;
let translateQueue = [];

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

// ── Terminal I/O ──
term.onData((data) => terminalAPI.sendInput(data));

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
const apiSaveBtn = document.getElementById('api-save-btn');

if (apiKey) {
  configDialog.classList.add('hidden');
  apiKeyInput.value = apiKey;
  apiBaseInput.value = apiBase;
}

apiSaveBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  apiBase = apiBaseInput.value.trim() || 'https://api.deepseek.com';
  if (!apiKey) return;
  localStorage.setItem('deepseek_api_key', apiKey);
  localStorage.setItem('deepseek_api_base', apiBase);
  configDialog.classList.add('hidden');
  term.focus();
});

// ── ANSI Strip ──
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''
  );
}

// ── Output Buffer ──
function bufferOutput(data) {
  if (!apiKey) return;
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
    .trim();

  if (!cleaned || cleaned.length < 3) return;

  // Skip progress bars, spinners, single chars
  if (/^[▓░█▏▎▍▌▋▊▉\s\-\\|/=>#.]+$/.test(cleaned)) return;
  if (/^\d+%/.test(cleaned) && cleaned.length < 20) return;

  enqueueTranslation(cleaned);
}

// ── Translation Queue ──
function enqueueTranslation(text) {
  translateQueue.push(text);
  if (!translating) processQueue();
}

async function processQueue() {
  if (translateQueue.length === 0) {
    translating = false;
    return;
  }
  translating = true;
  const text = translateQueue.shift();
  await translateText(text);
  processQueue();
}

// ── DeepSeek API (Streaming) ──
async function translateText(text) {
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
    const resp = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        stream: true,
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: '你是一个终端输出翻译助手。将用户提供的英文终端输出翻译成简洁的中文。保留命令名、路径、包名等技术术语不翻译。只输出翻译结果，不要解释。如果内容已经是中文，直接原样返回。如果是无意义的输出（如纯符号、空行），回复"—"。',
          },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      transEl.textContent = `❌ API 错误: ${resp.status}`;
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
    transEl.textContent = `❌ 网络错误: ${err.message}`;
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
