# MD Viewer 示例文档

这是一个演示文件，用来快速体验 **MD Viewer** 的渲染效果。

## 1. 文本样式

支持 **加粗**、*斜体*、~~删除线~~、`行内代码`，以及[超链接](https://www.markdownguide.org)。

> 这是一段引用文字。Markdown 让写作回归纯粹。

## 2. 列表与任务

- 水果
  - 苹果
  - 香蕉
- 蔬菜

1. 第一步
2. 第二步
3. 第三步

- [x] 已完成的任务
- [ ] 待办的任务
- [ ] 计划中的任务

## 3. 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 打开文件 | ✅ | 对话框 / 拖拽 / 命令行 |
| 代码高亮 | ✅ | highlight.js |
| 目录导航 | ✅ | 自动提取 H1~H3 |
| 暗色主题 | ✅ | 一键切换 |

## 4. 代码块

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Markdown"))
```

```javascript
const sum = (a, b) => a + b;
console.log(sum(2, 3));
```

## 5. 分隔与结尾

---

恭喜，你已经看完了示例！点击左上角「📂 打开」换一篇你自己的笔记吧。
