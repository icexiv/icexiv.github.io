# IceXIV

IceXIV 产品入口首页，使用 Notist SSG 构建，保留原生 HTML、CSS、JavaScript 和 SVG，无前端打包依赖。

## 开发与构建

`flake.lock` 固定 Notist 及其 Nix 依赖。进入开发环境后可直接使用 `notist`、Python 和 Node.js；也可通过 direnv 加载 `.envrc`。

```sh
nix develop
notist serve --port 8080 -j 4
```

访问 <http://127.0.0.1:8080>，源码变化后自动重建。静态构建使用 `notist build -j 4`，输出为 `dist/`。

也可使用 `nix build --cores 4 --max-jobs 2`，构建结果位于 `result/`。不进入开发环境时，可用 `nix run .#notist -- build -j 4`。

日常开发使用 `dev`，通过 PR 合入 `main`。`nix build .#cn --out-link result-cn` 构建国内站；直接使用 Notist 时通过 `SITE_TARGET=cn` 选择国内配置，默认是 `global`。

- `Notist.toml`：站点配置，默认部署于域名根路径。
- `content/index.md`：首页文档入口和页面属性。
- `content/projects/*.md`：每个项目的独立正文，使用 Notist Markdown。
- `content/components/media.notc`：截图内容函数，包装原生 Markdown 图片并提供边框、阴影与倾斜容器。
- `content/assets/`：正文引用的截图，由 Notist 跟踪、复制并解析路径。
- `data/projects.toml`：项目顺序、卡片简介、仓库、来源、操作和截图元数据。
- `scripts/projects.py`：Notist 站点 extension，将项目元数据与编译后的页面正文关联，生成 `site.data.catalog` 中的卡片、导航和详情数据。
- `templates/page.tera`：按 extension 数据渲染首页卡片、横向导航和详情。
- `templates/project.tera`：独立项目页；与首页复用 `panel`、`download` 和基础模板。
- `static/`：样式、脚本与图标，原样复制到发布目录。

Notist 将正文编译成 HTML，extension 不拼接正文或界面 HTML，模板负责布局。首页嵌入各项目正文，保留即时切换；每个项目同时生成 `projects/<id>.html` 独立页面。正文只维护一份。

添加项目时，在 `content/projects/` 新建 `.md` 页面（根属性设置 `title` 和 `template: "project"`），再向 `data/projects.toml` 的 `projects` 列表追加一项。正文使用 Markdown 标题、列表和代码块，元数据使用 Notist 的 `@!` 根注解。列表顺序即首页顺序，卡片、导航、详情及滚动条范围自动生成。

图片在 Markdown 正文中用 `![说明](../assets/文件.png)` 引用，放进 `#media.screenshot[ ... ]` 内容槽即可获得截图样式。不需要在项目元数据或模板里重复声明图片；extension 仅在嵌入正文时重定位资源链接，图片仍由 Notist 原生渲染。

## 产品入口

- Market：链接至 GitHub Pages 产品站。
- DB：灰色展示，标记 WIP，无链接。
- Eorzea：FFXIV 国服启动器，标记「实验」，App 按正式版／Dev 和平台提供下载；CLI 提供 Git 源码安装说明。

卡片文案在 `data/projects.toml` 中维护，正文在 `content/projects/*.md` 中维护，布局和颜色在 `static/style.css` 中维护，交互在 `static/projects.js` 中维护。
上方使用可横向浏览的 `li.project-card`，每张包含项目名称、简介和数据来源，GitHub 图标与仓库名位于卡片右上角。
卡片宽度为 380px，选中项居前并保持正面，相邻项缩小、后退、向内倾斜并轻微重叠；手机使用更小的宽度与倾斜幅度。
点击卡片或使用轮播箭头切换项目；方向键、Home、End 支持键盘选择。选中项始终居中，包括第一项、最后一项及窗口尺寸变化后。
轮播不自动播放，手动滑动吸附结束后同步选中居中的项目。
卡片下方的快速导航将 tab 名称和真实可拖动滚动条合为一体：滑块与一个 tab 同宽，点击名称、拖动滑块与滑动卡片互相同步。拖动滑块时按最近项目实时切换卡片选中态、tab 和详情，松手后再吸附居中。
导航支持方向键、Home、End；滑块也支持 PageUp、PageDown，触屏支持拖动，减少动态模式下立即吸附。
下方 `section.project-panel` 展示选中项目的详细说明与大图。标题行占满内容宽度，打开／下载按钮靠最右；说明段落与功能列表在标题下方按正文方式纵向排列。

Eorzea 正式版和 Dev 各使用一个分体按钮：主按钮下载当前识别的平台，大字显示渠道和版本，小字显示完整文件名；右侧箭头提供其他平台的直接下载链接。浏览器优先用 Client Hints 识别系统、架构和位数，再使用 UA 明确提供的架构；不能确认（如没有 Client Hints 的 Safari Mac）时保持主按钮禁用，让用户从箭头中手选，不猜测 Apple Silicon。识别到尚未提供构建的架构时也不会静默换成 x64。
浏览器读取静态清单，不请求 GitHub API，也不携带凭据。未发布渠道或缺少对应平台时，链接保持禁用；网络错误单独提示并可重试，不冒充“未发布”。两个下拉互斥，当前平台不重复出现在“其他平台”中。
国际站读取 Eorzea 仓库 `main/downloads/github.json`，仅使用 GitHub Release 地址；国内站读取本站 `/downloads/eorzea.json`，仅使用 TOS 地址。清单由 Eorzea 发布 CI 更新，网站无需因下载版本变化而重新构建。来源及备案配置位于 `data/deployment.toml`。
下拉基于原生 `details`，支持键盘展开、Escape 收起、点击外部收起和切换项目时关闭。
项目通过 `data-project`、`data-select`、`data-project-panel` 关联，选择按钮的 `aria-controls` 指向对应详情区域。
禁用 JavaScript 时展示全部项目详情，网站及仓库链接仍可使用。

大图保持真实截图，静止时保持清晰正视，鼠标移动时由同一个 `.screen` 容器统一变换图片、边框与阴影，指针移开后回正，不使用独立变换的背板。
背景为横向铺满、固定高度的点阵，不使用灰色衬底；触屏设备和减少动态效果模式下取消大图跟随倾斜，窄窗口中的鼠标仍可使用。
截图不裁切，仅作展示，不提供点击放大。Market 和 Eorzea 均使用原生 2 倍像素密度的实际界面截图，不对旧图插值放大。

Market 和 Eorzea 使用真实界面截图，DB 保留空白图片占位，不展示假想界面。
截图按比例完整显示，不重构产品布局。为保护隐私，仅将敏感文字替换为骨架短条，保留控件边框、图标及区域结构。替换截图时同步更新图片尺寸和替代文本。

### Market 截图来源

- 页面：<https://icexiv.github.io/icexiv-market/#/item/10>
- 截图日期：2026-11-14
- 页面构建标识：`ae33472`
- 视口：1040 × 680，像素密度为 2，导出图片 2080 × 1360
- 文件：`content/assets/market-screenshot-hidpi.png`

截图中的数据为拍摄时的行情，不代表当前价格。更新截图应使用实际产品页面，不修改页面结构或编造数据。

### Eorzea 截图来源

- 仓库：<https://github.com/icexiv/eorzea>
- 截图日期：2026-11-14
- 程序：用户当前运行的 Eorzea 原生 GUI
- 界面：实际已配置的启动器主页，游戏目录有效，Dalamud 已安装且版本匹配
- 窗口：1280 × 900，在临时 2 倍缩放输出上由原生程序实际渲染，截图为 2560 × 1800
- 导出：仅去除四周各 3 像素的桌面窗口外边框，图片为 2554 × 1794，不裁切界面正文
- 恢复：截图后恢复窗口尺寸、位置、工作区、焦点与指针位置，移除临时输出
- 隐私：仅账号、游戏路径、日志及状态栏文字替换为骨架短条，图片元数据已移除
- 保留：输入框、下拉箭头、侧栏设置按钮及完整运行日志区域
- 文件：`content/assets/eorzea-screenshot-skeleton-hidpi.png`

截图直接来自运行中的原生程序，没有重构界面或填充假账号。未遮盖的原始截图及 OCR 不应放入站点目录。Linux / macOS 通过 Wine 启动游戏；仓库 README 注明 macOS 尚未经过真机验证，首页保留「实验」标记。

## 样式缓存

基础模板的样式和交互脚本链接带有 `rev` 内容指纹，避免新 HTML 误用缓存的旧资源。extension 在每次构建时按文件内容自动计算指纹，无需手动更新模板。

## 检查

```sh
notist build -j 4
python3 -m unittest discover -s tests -v
node --check static/projects.js
```

默认检查 `dist/` 生成站点；可用 `SITE_ROOT=result` 检查 Nix 构建产物。包括 extension 协议、目录关联、动态项目数量、资源指纹、静态资源、项目选择结构、独立页、图片占位及截图尺寸。

## 发布

将 `dist/`（或 `nix build` 的 `result/`）内的内容部署到静态站点根目录，不要部署源码目录。
GitHub Pages 使用国际产物，`icexiv.top` 使用国内产物；二者都不直接发布源码目录。国内站悬挂与 Market 一致的 ICP 备案，公安备案为空时不显示。

### GitHub Pages CI

`.github/workflows/pages.yml` 使用锁定的 Nix 环境构建站点，检查生成页面、extension 与 JavaScript 语法，再上传 `result/` 作为 Pages 产物。

- 向 `main` 发起 PR：构建、检查两个产物，不读取部署凭据、不部署。
- 推送 `main`：检查通过后并行部署 GitHub Pages 和自建服务器。
- 手动运行：任意分支可构建，仅 `main` 可部署。

Pages Source 使用 **GitHub Actions**。服务器部署使用专用受限密钥与 `rrsync`，同步时排除 `/downloads/`，不会删除 Eorzea 独立发布的清单。服务器配置与授权说明见 `ops/README.md`。
