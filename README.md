# MD Viewer · Markdown 友好阅读器（多文件版）

一个极简的桌面小工具：双击打开 `.md` 文件，像读文档一样舒服地浏览 Markdown。现在支持**同时打开多个 md 文件**，顶部标签页切换，关闭方便。

**已打包成单个 `MDViewer.exe`**，不需要安装 Python、不需要联网、不依赖任何外部文件——一个 exe 带走即用。

## 两种交付形态

### A. 单文件 exe（推荐，最省事）
- 只要 `dist/MDViewer.exe` 这一个文件
- 直接双击打开；或拖一个 `.md` 到它上面；或命令行 `MDViewer.exe "笔记.md"`
- 可单独拷到任意 Windows 电脑 / U 盘使用，**旁边不需要任何其它文件**

### B. 便携文件夹版（含源码，便于二次修改）
- 整个 `md-viewer/` 文件夹自带 Python 环境，双击 `start.bat` 即可
- 适合想改代码、重新打包的场景

## 功能

- 📂 **打开方式多样**：菜单按钮、直接拖拽 `.md` 到窗口、命令行传入路径、文件关联
- 📑 **多文件标签页**：可同时打开多个 `.md`，顶部标签切换，点 × 关闭
- 📄 **GitHub 风格渲染**：标题、列表、表格、引用、代码块、任务列表、删除线（GFM）
- 🌈 **代码高亮**：基于 highlight.js，自动识别语言
- 🧭 **目录导航**：左侧自动提取 H1~H3，点击平滑跳转
- 🌗 **亮 / 暗主题**：一键切换，记忆上次选择
- 🔄 **自动刷新**：外部编辑当前 `.md` 保存后窗口自动重渲染（工具栏可关）
- 🖼️ **图片内联**：`.md` 中相对路径图片自动转 base64 内联，离线也不丢图
- 📋 **复制内容**：工具栏「📋 复制」按钮（有选区复制选区、无选区复制全文）；正文**右键菜单**可复制选中文字 / 全文纯文本 / 全文 Markdown 源码；每个代码块右上角带悬浮「复制」按钮。复制成功有轻提示

## 系统要求

- **Windows 10 / 11（x64）**。exe 内置的是 Windows 版 Python，不能用于 macOS / Linux。
- 系统需有 **Microsoft Edge WebView2 Runtime**（Win10/11 通常自带；若缺失，到微软官网下载 "WebView2 Runtime" 安装一次即可）。

## 目录结构（仓库全貌，普通用户只需 `dist/MDViewer.exe`）

```
md-viewer/
├── dist/
│   └── MDViewer.exe     # ⭐ 单文件成品，拿到就能用
├── app.py               # 后端：pywebview 窗口 + 文件读取/监听（打包源）
├── start.bat            # 便携文件夹版启动脚本
├── README.md
├── sample.md            # 演示文档
├── python/              # 便携文件夹版自带 Python（打包时已被打进 exe，可删）
├── web/                 # 前端（已被打进 exe 的 web/ 资源，可删）
├── build/               # PyInstaller 中间产物，可安全删除
└── MDViewer.spec        # PyInstaller 打包配置
```

## 如何重新打包（可选）

如需改代码后重新生成 exe，在 `md-viewer/` 目录下执行：

```bat
python\python.exe -m PyInstaller --noconfirm --onefile --windowed ^
  --name MDViewer --icon app-icon.ico --add-data "web;web" ^
  --collect-all webview --hidden-import webview app.py
```

产物在 `dist/MDViewer.exe`。

## 已知边界

- 拖拽进来的 `.md` 若含**相对路径图片**，因浏览器安全限制无法定位本地目录，图片可能不显示；带图片的文档请用「📂 打开」或命令行传入，后端会正确内联。
- 仅渲染，不编辑（保持"小工具"定位）。外部编辑器改完保存会自动刷新。
