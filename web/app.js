// 2026-08-25 Henry / 墨
// md-viewer 前端逻辑：多文件标签页、Markdown 渲染、目录、拖拽、主题、自动刷新

const contentEl = document.getElementById('content');
const tocEl = document.getElementById('toc');
const tabsEl = document.getElementById('tabs');
const dropzone = document.getElementById('dropzone');
const placeholder = document.getElementById('placeholder');

let currentPath = null;
let fileMap = {}; // path -> {name, content, dir}

// 开启 GFM（表格、任务列表、删除线等）
marked.setOptions({ gfm: true, breaks: false });

function render(data) {
  if (!data) return;
  currentPath = data.path;
  fileMap[data.path] = {
    name: data.name,
    dir: data.dir,
    content: data.content,
  };
  placeholder.style.display = 'none';
  const html = marked.parse(data.content || '');
  contentEl.innerHTML = html;
  // 代码高亮
  contentEl.querySelectorAll('pre code').forEach((b) => {
    try { hljs.highlightElement(b); } catch (e) { /* 忽略单语言解析失败 */ }
  });
  buildToc();
  contentEl.scrollTop = 0;
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
      // 后端状态丢失但前端有缓存，直接切过去
      const cached = fileMap[path];
      currentPath = path;
      placeholder.style.display = 'none';
      contentEl.innerHTML = marked.parse(cached.content || '');
      contentEl.querySelectorAll('pre code').forEach((b) => {
        try { hljs.highlightElement(b); } catch (e) {}
      });
      buildToc();
      contentEl.scrollTop = 0;
      refreshTabs();
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
        // 显示剩余最后一个文件（优先展示真实后端文件，若都无内容则取最后一个）
        const lastPath = remaining[remaining.length - 1];
        const cached = fileMap[lastPath];
        currentPath = lastPath;
        placeholder.style.display = 'none';
        contentEl.innerHTML = marked.parse(cached.content || '');
        contentEl.querySelectorAll('pre code').forEach((b) => {
          try { hljs.highlightElement(b); } catch (e) {}
        });
        buildToc();
        contentEl.scrollTop = 0;
        refreshTabs();
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
