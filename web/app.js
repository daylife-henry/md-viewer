// 2026-08-25 Henry / 墨
// md-viewer 前端逻辑：多文件标签页、Markdown 渲染、目录、拖拽、主题、自动刷新
// 升级：代码块复制按钮 + 自定义右键菜单 + 工具栏复制 + 正文选区显式开启 + 复制 toast
// （解决 WebView2 默认禁用右键菜单导致"选了复制不出来"的问题）

const contentEl = document.getElementById('content');
const tocEl = document.getElementById('toc');
const tabsEl = document.getElementById('tabs');
const dropzone = document.getElementById('dropzone');
const placeholder = document.getElementById('placeholder');
const ctxMenu = document.getElementById('ctx-menu');
const toastEl = document.getElementById('toast');

let currentPath = null;
let fileMap = {}; // path -> {name, content, dir}

// 开启 GFM（表格、任务列表、删除线等）
marked.setOptions({ gfm: true, breaks: false });

// ---------- 渲染核心 ----------
// 统一渲染：innerHTML -> 高亮 -> 代码块复制按钮 -> 目录 -> 回到顶部
function paint(html) {
  contentEl.innerHTML = html;
  contentEl.querySelectorAll('pre code').forEach((b) => {
    try { hljs.highlightElement(b); } catch (e) { /* 忽略单语言解析失败 */ }
  });
  addCodeCopyButtons();
  buildToc();
  contentEl.scrollTop = 0;
}

function render(data) {
  if (!data) return;
  currentPath = data.path;
  fileMap[data.path] = {
    name: data.name,
    dir: data.dir,
    content: data.content,
  };
  placeholder.style.display = 'none';
  paint(marked.parse(data.content || ''));
  refreshTabs();
}

// 后端状态丢失但前端有缓存时，直接从 fileMap 渲染
function showFromCache(path) {
  const cached = fileMap[path];
  if (!cached) return;
  currentPath = path;
  placeholder.style.display = 'none';
  paint(marked.parse(cached.content || ''));
  refreshTabs();
}

function buildToc() {
  tocEl.innerHTML = '';
  const heads = contentEl.querySelectorAll('h1, h2, h3');
  if (!heads.length) {
    tocEl.innerHTML = '<div class="toc-empty">（无标题）</div>';
    return;
  }
  heads.forEach((h, i) => {
    if (!h.id) h.id = 'h-' + i;
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    a.className = 'toc-' + h.tagName.toLowerCase();
    a.addEventListener('click', (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    tocEl.appendChild(a);
  });
}

function refreshTabs() {
  tabsEl.innerHTML = '';
  const paths = Object.keys(fileMap);
  if (!paths.length) {
    tabsEl.innerHTML = '<span class="no-file">未打开文件</span>';
    return;
  }
  paths.forEach((path) => {
    const item = fileMap[path];
    const tab = document.createElement('div');
    tab.className = 'tab' + (path === currentPath ? ' active' : '');
    tab.title = item.name;
    // 整个 tab 都可点击切换
    tab.addEventListener('click', () => switchFile(path));

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = item.name;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '&times;';
    close.title = '关闭';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFile(path);
    });

    tab.appendChild(label);
    tab.appendChild(close);
    tabsEl.appendChild(tab);
  });
}

// 切换文件：优先走后端；若后端找不到但前端有缓存，直接用缓存兜底
async function switchFile(path) {
  if (path === currentPath) return;
  try {
    const data = await window.pywebview.api.switch_file(path);
    if (data) {
      render(data);
    } else if (fileMap[path]) {
      showFromCache(path);
    }
  } catch (e) { console.error(e); }
}

async function openFile() {
  try {
    const result = await window.pywebview.api.open_dialog();
    if (!result) return;
    if (result.files && result.files.length) {
      result.files.forEach((f) => { fileMap[f.path] = { name: f.name, dir: f.dir, content: f.content }; });
      const current = result.current || result.files[result.files.length - 1].path;
      const target = result.files.find((f) => f.path === current) || result.files[result.files.length - 1];
      render(target);
    } else if (result.content) {
      // 兼容旧返回格式
      render(result);
    }
  } catch (e) { console.error(e); }
}

async function closeFile(path) {
  try {
    delete fileMap[path];
    const data = await window.pywebview.api.close_file(path);
    if (data) {
      render(data);
    } else {
      // 后端无此文件（如拖拽临时文件）或已全部关闭
      const remaining = Object.keys(fileMap);
      if (remaining.length) {
        showFromCache(remaining[remaining.length - 1]);
      } else {
        currentPath = null;
        contentEl.innerHTML = '';
        tocEl.innerHTML = '';
        placeholder.style.display = 'block';
        refreshTabs();
      }
    }
  } catch (e) { console.error(e); }
}

async function reloadCurrent() {
  try {
    const data = await window.pywebview.api.reload_current();
    if (data) render(data);
  } catch (e) { console.error(e); }
}

// 后端文件变更时主动调用
window.__onFileChanged = function () {
  const cb = document.getElementById('autorefresh');
  if (cb && cb.checked) reloadCurrent();
};

function toggleTheme() {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  document.getElementById('hljs-theme').href =
    dark ? 'assets/github-dark.min.css' : 'assets/github.min.css';
  try { localStorage.setItem('mdviewer-theme', dark ? 'dark' : 'light'); } catch (e) {}
}

// ---------- 复制能力 ----------
// 兼容 WebView2 非安全上下文：优先 execCommand 兜底，再试 clipboard API
function copyText(text) {
  if (!text) return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch (e) { /* 走下方兜底 */ }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
  } catch (e) { /* 忽略 */ }
  return false;
}

let toastTimer = null;
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => { toastEl.classList.add('show'); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 200);
  }, 1200);
}

function copyAndToast(text, okMsg) {
  if (!text || !text.trim()) {
    showToast('没有可复制的内容');
    return;
  }
  const ok = copyText(text);
  showToast(ok ? (okMsg || '已复制') : '复制失败');
}

// 每个代码块加一个右上角"复制"按钮
function addCodeCopyButtons() {
  contentEl.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.code-copy')) return; // 防止重复添加
    const btn = document.createElement('button');
    btn.className = 'code-copy';
    btn.type = 'button';
    btn.textContent = '复制';
    btn.title = '复制代码';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = pre.querySelector('code');
      const text = code ? code.textContent : (pre.textContent || '');
      const ok = copyText(text);
      if (ok) {
        btn.textContent = '已复制';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1200);
      } else {
        btn.textContent = '失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      }
    });
    pre.appendChild(btn);
  });
}

// 取当前在正文内的选区文字
function getSelectionText() {
  const sel = window.getSelection();
  if (sel && sel.toString && sel.toString().trim()) {
    const anchor = sel.anchorNode;
    if (anchor && contentEl.contains(anchor)) return sel.toString();
  }
  return '';
}

// 自定义右键菜单：弥补 WebView2 被禁用的原生右键复制
contentEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const selText = getSelectionText();
  ctxMenu.querySelectorAll('li').forEach((li) => {
    if (li.dataset.action === 'copy-selection') {
      li.classList.toggle('disabled', !selText);
    }
  });
  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 210) + 'px';
  ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
  ctxMenu.hidden = false;
});

document.addEventListener('click', (e) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) ctxMenu.hidden = true;
});
window.addEventListener('scroll', () => { if (!ctxMenu.hidden) ctxMenu.hidden = true; }, true);

ctxMenu.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li || li.classList.contains('disabled')) return;
  const action = li.dataset.action;
  if (action === 'copy-selection') {
    copyAndToast(getSelectionText(), '已复制选中文字');
  } else if (action === 'copy-text') {
    copyAndToast(contentEl.innerText, '已复制全文');
  } else if (action === 'copy-md') {
    const item = fileMap[currentPath];
    copyAndToast(item ? item.content : '', '已复制 Markdown 源码');
  }
  ctxMenu.hidden = true;
});

// 工具栏"📋 复制"：有选区复制选区，无选区复制全文
document.getElementById('btn-copy').addEventListener('click', () => {
  const sel = getSelectionText();
  if (sel) {
    copyAndToast(sel, '已复制选中文字');
  } else {
    copyAndToast(contentEl.innerText, '已复制全文');
  }
});

// ---- 拖拽打开（支持多文件）----
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropzone.classList.add('show'); });
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth--; if (dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('show'); } });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('show');
  const files = Array.from(e.dataTransfer.files).filter((f) => /\.md$/i.test(f.name));
  if (!files.length) {
    alert('请拖入 .md 文件');
    return;
  }
  // 在浏览器里读取拖拽文件；多文件时只渲染最后一个
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = { content: ev.target.result, name: file.name, path: file.name, dir: '' };
      render(data);
    };
    reader.readAsText(file);
  });
});

document.getElementById('btn-open').addEventListener('click', openFile);
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// pywebview 注入 API 就绪后初始化
window.addEventListener('pywebviewready', async () => {
  try {
    if (localStorage.getItem('mdviewer-theme') === 'dark') toggleTheme();
  } catch (e) {}
  try {
    const data = await window.pywebview.api.load_initial();
    if (data) render(data);
  } catch (e) { console.error(e); }
});
