# 鱼猫投放MCP 隐私政策 / Privacy Policy

**最后更新 / Last updated：** 2026-09-28

[中文](#中文) · [English](#english)

---

## 中文

本政策说明 **鱼猫投放MCP** 浏览器扩展（下称"本扩展"）及与其配套运行在您电脑上的本地引擎（下称"引擎"）如何处理信息。如有疑问，请在 [本仓库的 Issues](https://github.com/yuhemao/xhs-kit-dist/issues) 中联系我们。

### 1. 单一用途

本扩展让您选择的 AI 助手（例如 Claude、WorkBuddy）通过您电脑上的本地引擎，在一个独立的"代理窗口"中使用您已登录的浏览器，按您的要求完成投放与营销后台操作（例如查询账号信息、提交订单）。本扩展只与同一台电脑上的本地引擎通信（回环地址 `127.0.0.1`，默认端口 52890）。

### 2. 本扩展会访问的数据

以下数据仅在**您的电脑上**、仅在您（通过 AI 助手）发起任务时被访问：

| 类别 | 内容 | 用途 |
|---|---|---|
| 网页内容 | 代理窗口中受控页面，或您明确允许借用的标签页的 DOM、可访问性树、HTML 和截图 | 读取页面、定位元素、确认操作结果 |
| 模拟输入 | 通过 Chrome DevTools Protocol 派发的点击、键盘输入和表单值 | 执行您委托的操作 |
| 同源请求 | 在受控页面内、以该网站的登录状态发起的同源接口请求 | 执行您委托的后台操作；登录凭据和 Cookie 不会被读取或离开浏览器 |
| 标签页与窗口信息 | 标签页 ID、URL、标题、窗口 ID | 将指令发送到正确的页面 |
| 扩展本地存储 | 随机实例 ID、可选标签、功能偏好 | 识别此浏览器并恢复设置 |
| 文件传输 | 您明确要求上传的本地文件，以及单次下载任务产生的文件 | 完成上传或下载任务 |
| 系统通知 | 借用标签页或需要您协助（如验证码）时的通知 | 征求您的同意或提示您操作 |

### 3. 我们不收集任何数据

- 本扩展和引擎**不会向我们发送任何数据**。我们没有接收遥测、日志或页面内容的服务器。
- 操作结果只返回给您电脑上的本地引擎，再由它交给您选择的 AI 助手。AI 助手如何处理这些结果，适用该助手自身的隐私政策。
- 本扩展不读取浏览历史、书签、保存的密码或自动填充数据，不包含分析统计、广告、指纹识别或跨站跟踪，不出售任何数据。

### 4. 引擎的网络访问

引擎会从 GitHub（`github.com`、`raw.githubusercontent.com`）下载**经过数字签名**的功能包和引擎更新。这些请求只下载文件，不包含您的任何数据；与访问任何网站一样，GitHub 会看到您的 IP 地址。签名校验失败的内容不会被使用。

### 5. 权限说明

- **`debugger`**：将 Chrome DevTools Protocol 附加到代理窗口或您明确借用的标签页，用于读取和操作这些页面。
- **`activeTab`**：您点击扩展时临时访问当前标签页，用于您主动发起的快捷功能。
- **`scripting`**：在受控页面缺少辅助脚本时补充注入（例如长截图）。
- **`webNavigation`**：跟踪页面导航和 frame，确保操作对应到正确的页面。
- **`tabs`** / **`windows`**：创建和管理独立的代理窗口及其中的标签页，把自动化与您的日常浏览隔离开。
- **`alarms`** / **`idle`**：保持与本地引擎的连接，并在电脑从休眠恢复后重新连接；不保存或传输空闲状态。
- **`notifications`**：借用标签页或需要您协助时发送系统通知。
- **`downloads`**：只处理由单次下载任务发起的下载，不读取下载历史。
- **`storage`**：保存实例 ID、可选标签和功能偏好。
- **主机权限 `<all_urls>`**：在受控页面显示"代理已激活"状态浮层，并支持您让 AI 助手访问您指定的网站。

### 6. 数据保留

- 扩展设置保存在 `chrome.storage.local`，直到您卸载扩展或清除扩展数据。
- 页面内容和截图只作为任务响应返回给本地引擎，不会被本扩展长期保存。
- 上传、下载的临时文件保存在本地引擎的私有目录中，任务结束后删除。
- 操作审计默认关闭；开启后仅在您电脑的 `~/.xhs-kit/audit` 中保存操作元数据（不含输入值、页面正文、截图或文件内容），保留 30 天。

### 7. 您的控制权

您可以随时：关闭代理窗口以立即停止自动化；拒绝借用标签页的请求；在扩展弹窗中关闭连接；在 `chrome://extensions` 中卸载本扩展以清除其存储。

### 8. 儿童隐私

本扩展面向企业营销与投放人员，并非面向 13 岁以下儿童，不会有意收集任何人的个人信息。

### 9. 政策变更

政策如有重大变更，会更新上方日期并在本仓库中发布新版本。

---

## English

This policy explains how the **鱼猫投放MCP** browser extension ("the extension") and its companion local engine running on your computer ("the engine") handle information. Questions: please open an issue in [this repository](https://github.com/yuhemao/xhs-kit-dist/issues).

### 1. Single purpose

The extension lets an AI assistant you choose (e.g. Claude, WorkBuddy) use your logged-in browser in a separate "Agent Window", through the local engine on your computer, to carry out advertising and marketing back-office tasks you request (e.g. checking account details, placing orders). The extension only talks to the local engine on the same computer (loopback `127.0.0.1`, default port 52890).

### 2. Data the extension accesses

Only on **your computer**, and only when you (through your AI assistant) start a task:

- **Page content** — DOM, accessibility tree, HTML and screenshots of pages in the Agent Window or tabs you explicitly allow it to borrow; used to read pages, locate elements and confirm results.
- **Simulated input** — clicks, keystrokes and form values dispatched via the Chrome DevTools Protocol; used to perform the tasks you delegate.
- **Same-origin requests** — requests made from inside a controlled page with that site's existing login; credentials and cookies are never read and never leave the browser.
- **Tab and window metadata** — tab IDs, URLs, titles and window IDs; used to route commands to the right page.
- **Local extension storage** — a random instance ID, an optional label and feature preferences.
- **File transfers** — local files you explicitly ask to upload, and files produced by a single download task.
- **Notifications** — to ask for consent before borrowing a tab, or when your help is needed (e.g. a CAPTCHA).

### 3. We collect nothing

- Neither the extension nor the engine sends any data to us. We operate no server that receives telemetry, logs or page content.
- Results go only to the local engine, which hands them to the AI assistant you chose; that assistant's own privacy policy governs what it does with them.
- No browsing history, bookmarks, saved passwords or autofill data are read. No analytics, advertising, fingerprinting or cross-site tracking. No data is sold.

### 4. Engine network access

The engine downloads **digitally signed** feature packages and engine updates from GitHub (`github.com`, `raw.githubusercontent.com`). These requests only fetch files and contain none of your data; as with any website, GitHub sees your IP address. Anything that fails signature verification is discarded.

### 5. Permissions

`debugger` (attach DevTools Protocol to the Agent Window or explicitly borrowed tabs), `activeTab` (temporary access when you click the extension), `scripting` (re-inject helper scripts such as full-page screenshot), `webNavigation` (map actions to the correct document/frame), `tabs` and `windows` (manage the separate Agent Window), `alarms` and `idle` (keep and restore the local connection; idle state is not stored or sent), `notifications` (consent and help prompts), `downloads` (only the download started by a single download task), `storage` (instance ID, label, preferences), host permission `<all_urls>` (show the "agent active" overlay on controlled pages and let you direct the assistant to sites you choose).

### 6. Retention

Settings stay in `chrome.storage.local` until you uninstall or clear extension data. Page content and screenshots are returned to the local engine as task responses and not kept by the extension. Temporary upload/download files live in the engine's private folder and are removed when the task ends. Operation audit is off by default; when enabled it keeps action metadata only (no input values, page text, screenshots or file contents) in `~/.xhs-kit/audit` on your computer for 30 days.

### 7. Your controls

Close the Agent Window to stop automation immediately; decline tab-borrow requests; turn the connection off in the popup; uninstall at `chrome://extensions` to clear its storage.

### 8. Children

The extension is for business marketing staff, not for children under 13, and does not knowingly collect personal information from anyone.

### 9. Changes

Material changes will update the date above and be published in this repository.
