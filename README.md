# HTML 目录助手

一个基于 Manifest V3 的 Chromium 浏览器扩展。它会读取网页或本地 HTML 中的 `h1` 到 `h6` 标题，在页面右上角生成可折叠、可拖动、可缩放的目录面板，并支持将目录复制为 Markdown。

适用于 Microsoft Edge、Google Chrome 以及其他支持 Manifest V3 的 Chromium 浏览器。

## 功能

- 自动读取 `h1` 到 `h6` 标题并生成层级目录
- 点击目录项平滑跳转到对应标题
- 单独展开或折叠任意标题分支
- 将目录复制为 Markdown 链接目录、标题结构或项目符号大纲
- 动态监听页面标题变化并自动刷新目录
- 支持拖动、八方向缩放、整体折叠和临时关闭
- 自动保存面板位置与尺寸
- 支持普通网页和本地 `file://` HTML
- 使用 `Ctrl + Shift + Y` 快速开关目录
- 所有目录解析均在本地完成，不向服务器上传页面内容

## 安装

### 从源码安装

1. 在 Edge 中打开 `edge://extensions/`；在 Chrome 中打开 `chrome://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本仓库根目录。
5. 如需读取本地 HTML，请进入扩展详情并开启“允许访问文件 URL”。

### 从发布包安装

1. 打开 GitHub 仓库的 **Releases** 页面。
2. 下载最新版本的 `html-toc-assistant-vX.Y.Z.zip`。
3. 将 ZIP 解压到一个固定目录。
4. 按上面的步骤加载解压后的目录。

浏览器不能直接把 ZIP 当作未打包扩展运行，因此必须解压后加载。

## 使用

- 拖动标题栏可以移动目录面板。
- 拖动面板边缘或角落可以调整尺寸。
- 点击标题前的 `▾` / `▸` 可以折叠或展开子目录。
- 点击标题栏的 `MD` 可以复制 Markdown 链接目录。
- 右键标题栏可以复制链接目录、Markdown 标题结构或项目符号大纲。
- 点击 `−` 可以折叠面板，点击 `×` 可以关闭当前页面的目录。
- 打开扩展弹窗后，可以重新开启目录或刷新当前页面目录。
- 使用 `Ctrl + Shift + Y` 可以快速开关目录。

Markdown 链接目录示例：

```markdown
- [第一章](#第一章)
  - [第一节](#第一节)
```

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存开关状态、折叠状态和面板位置 |
| `activeTab` | 从弹窗操作当前标签页 |
| `scripting` | 在尚未注入内容脚本的页面中启用扩展 |
| `clipboardWrite` | 用户主动点击复制按钮时写入剪贴板 |
| `<all_urls>` | 在用户访问的普通网页中读取标题并生成目录 |
| `file:///*` | 在用户允许访问文件 URL 后处理本地 HTML |

## 隐私

本扩展不需要账号，不包含分析、广告或跟踪代码，也不会上传网页内容、目录数据或剪贴板内容。详细说明见 [PRIVACY.md](PRIVACY.md)。

## 项目结构

```text
.
├── .github/
│   └── workflows/
│       ├── release.yml
│       └── validate.yml
├── .gitattributes
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── PRIVACY.md
├── README.md
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.css
├── popup.js
└── styles.css
```

- `manifest.json`：扩展清单和权限配置
- `content.js`：目录生成、折叠、拖动与缩放
- `styles.css`：页面内目录面板样式
- `background.js`：快捷键和内容脚本注入
- `popup.html` / `popup.css` / `popup.js`：扩展弹窗

## 开发与校验

项目没有构建依赖。修改源码后，在浏览器扩展管理页点击“重新加载”，再刷新需要测试的页面。

本地可以执行以下命令检查 JavaScript 语法和清单文件：

```powershell
node --check background.js
node --check content.js
node --check popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

仓库中的 GitHub Actions 会在提交和拉取请求时执行同样的基础校验。

## 发布新版本

1. 更新 `manifest.json` 和 `CHANGELOG.md` 中的版本号。
2. 提交更改并创建版本标签，例如 `v1.2.1`。
3. 推送标签后，`release.yml` 会打包源码并创建 GitHub Release。

```powershell
git add .
git commit -m "Release v1.2.1"
git tag -a v1.2.1 -m "HTML 目录助手 v1.2.1"
git push origin main
git push origin v1.2.1
```

## 许可证

本项目采用 [MIT License](LICENSE)。
