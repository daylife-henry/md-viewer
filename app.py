# 2026-08-25 Henry / 墨
# md-viewer 后端：pywebview 原生窗口 + 本地 Markdown 渲染
# 功能：打开 .md（对话框/拖拽/命令行）、GFM 渲染、代码高亮、目录导航、
#       亮暗主题、自动刷新（文件变更时重渲染）、相对图片内联为 base64、
#       多文件标签页（同时打开多个 md，点击切换）

import os
import sys
import re
import base64
import threading
import time
import webview

# PyInstaller 单文件模式会把数据文件解压到临时目录 sys._MEIPASS；
# 开发模式下用脚本所在目录。两者都能正确定位 web/。
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, 'web')

# 支持的图片扩展名 -> MIME
IMG_EXT = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.bmp': 'image/bmp',
}


class Api:
    def __init__(self, initial_path=None):
        self.opened = []          # [{path, name, dir}, ...]
        self.current_path = None  # 当前激活的文件路径
        self.initial_path = initial_path
        self._stop = False

    # ---------- 暴露给前端的接口 ----------
    def load_initial(self):
        """窗口启动时，若命令行传入了 .md 路径则直接加载。"""
        if self.initial_path and os.path.isfile(self.initial_path):
            return self._open_path(self.initial_path)
        return None

    def open_dialog(self):
        """弹出系统文件选择框，允许多选，返回 {files:[...], current: path}。"""
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=("Markdown 文件 (*.md;*.markdown)", "所有文件 (*.*)")
        )
        if result and len(result) > 0:
            # 只取 .md/.markdown
            paths = [p for p in result if p.lower().endswith(('.md', '.markdown'))]
            if not paths:
                return None
            files = []
            for path in paths:
                files.append(self._add_file(path))
            return {'files': files, 'current': self.current_path}
        return None

    def switch_file(self, path):
        """前端点击标签时切换到指定文件。"""
        if not path:
            return None
        for item in self.opened:
            if item['path'] == path:
                self.current_path = path
                self._start_watch(path)
                return self._read_md(path)
        return None

    def close_file(self, path):
        """关闭指定文件；返回切换后的新当前文件数据，或 None。"""
        self.opened = [f for f in self.opened if f['path'] != path]
        if self.current_path == path:
            # 切换到相邻文件
            if self.opened:
                new_path = self.opened[-1]['path']
                self.current_path = new_path
                self._start_watch(new_path)
                return self._read_md(new_path)
            else:
                self.current_path = None
                self._stop = True
                return None
        # 关闭非当前文件，当前文件不变
        if self.current_path:
            return self._read_md(self.current_path)
        return None

    def get_opened_list(self):
        """返回当前打开的文件列表及当前激活索引。"""
        current = self.current_path
        return {
            'files': [{'path': f['path'], 'name': f['name']} for f in self.opened],
            'current': current,
        }

    def reload_current(self):
        """自动刷新时由前端调用，重新读取当前文件。"""
        if self.current_path and os.path.isfile(self.current_path):
            return self._read_md(self.current_path)
        return None

    # ---------- 内部实现 ----------
    def _open_path(self, path):
        """用于初始加载：加入列表并设为当前。"""
        return self._add_file(path)

    def _add_file(self, path):
        """把文件加入已打开列表，若已存在则直接切过去。"""
        path = os.path.normpath(os.path.abspath(path))
        for item in self.opened:
            if item['path'] == path:
                self.current_path = path
                self._start_watch(path)
                return self._read_md(path)
        self.current_path = path
        self._start_watch(path)
        return self._read_md(path)

    def _read_md(self, path):
        try:
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
        except Exception as e:
            data = {
                'content': '# 读取失败\n\n```\n' + str(e) + '\n```',
                'name': os.path.basename(path),
                'dir': os.path.dirname(path),
                'path': path,
            }
            self._update_opened(data)
            return data
        base = os.path.dirname(path)
        text = self._inline_images(text, base)
        data = {'content': text, 'name': os.path.basename(path), 'dir': base, 'path': path}
        self._update_opened(data)
        return data

    def _update_opened(self, data):
        """同步 opened 列表中的当前文件元信息。"""
        path = data['path']
        for i, item in enumerate(self.opened):
            if item['path'] == path:
                self.opened[i] = data
                return
        self.opened.append(data)

    def _inline_images(self, text, base):
        """把 Markdown 中相对路径的图片内联成 base64 data URI，避免离线/路径问题。"""
        def repl(m):
            alt, src = m.group(1), m.group(2).strip()
            if src.startswith(('http://', 'https://', 'data:', '//', '#')):
                return m.group(0)
            rel = src.split('?')[0]
            p = rel if os.path.isabs(rel) else os.path.normpath(os.path.join(base, rel))
            if os.path.isfile(p):
                ext = os.path.splitext(p)[1].lower()
                mime = IMG_EXT.get(ext, 'application/octet-stream')
                try:
                    with open(p, 'rb') as img:
                        b = base64.b64encode(img.read()).decode('ascii')
                    return '![{0}](data:{1};base64,{2})'.format(alt, mime, b)
                except Exception:
                    return m.group(0)
            return m.group(0)
        return re.sub(r'!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)', repl, text)

    def _start_watch(self, path):
        """重启监听线程：文件 mtime 变化则通知前端重渲染。"""
        self._stop = True
        time.sleep(0.05)
        self._stop = False
        t = threading.Thread(target=self._watch, args=(path,), daemon=True)
        t.start()

    def _watch(self, path):
        try:
            last = os.path.getmtime(path)
        except OSError:
            last = None
        while not self._stop:
            time.sleep(1)
            if self._stop:
                break
            try:
                m = os.path.getmtime(path)
            except OSError:
                continue
            if last is not None and m != last:
                last = m
                try:
                    webview.windows[0].evaluate_js('window.__onFileChanged()')
                except Exception:
                    pass


def main():
    initial = sys.argv[1] if len(sys.argv) > 1 else None
    api = Api(initial)
    index_path = os.path.join(WEB_DIR, 'index.html')
    url = 'file:///' + index_path.replace(os.sep, '/')
    webview.create_window(
        'MD Viewer · Markdown 友好阅读器',
        url=url,
        js_api=api,
        width=1100,
        height=800,
        min_size=(720, 480),
    )
    webview.start()


if __name__ == '__main__':
    main()
