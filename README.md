# SillyTavern New API 密钥信息

这是一个 SillyTavern 前端扩展，用于聊天补全的 `Custom (OpenAI-compatible)` 连接页面。
它会在连接配置区域显示 new-api 模型价格和当前密钥余额。

## 功能

- 仅面向 new-api。
- 点击连接后，等待模型列表加载完成，再获取当前模型价格。
- 支持按次价格和按量价格显示。
- 如果页面中存在完整 API key，会查询密钥余额。
- 如果 SillyTavern 只显示已保存但隐藏的密钥，前端扩展无法读取真实 key，因此不能查询余额。
- 黑底白字显示，尽量不受 SillyTavern 主题影响。

## 安装

把仓库导入 SillyTavern / TauriTavern 的第三方扩展管理器，或手动复制到扩展目录：

- `SillyTavern/data/default-user/extensions/sillytavern-new-api-key-info`
- `SillyTavern/public/scripts/extensions/third-party/sillytavern-new-api-key-info`

然后重启 SillyTavern，或刷新浏览器页面，并在扩展管理里启用 `New API 密钥信息`。

## 刷新时机

- 自动刷新：点击聊天补全连接按钮后触发。
- 等待模型：连接后最多等待 8 秒，直到模型选择框出现模型。
- 手动刷新：点击面板里的 `刷新`。
- 切换模型：只用已经缓存的价格数据重新显示，不会重新请求余额接口。

## 需要的 new-api 接口

- `GET /api/pricing`
- `GET /api/usage/token`

扩展会从自定义 API 地址推导 new-api 根地址，例如：

- `https://api.example.com/v1` -> `https://api.example.com/api/pricing`
- `https://api.example.com/v1/chat/completions` -> `https://api.example.com/api/usage/token`

## 关于隐藏密钥和余额

纯前端扩展只能读取当前网页里已经存在的数据。
如果 SillyTavern 保存了密钥，但连接页面只显示密钥名称、占位符、星号或隐藏状态，真实 API key 不在页面 DOM 中，扩展就不能拿它去请求 `/api/usage/token`。

截图中那种“密钥管理弹窗里能看到完整 key”的场景，理论上可以从弹窗文本里读取，但不建议这样做：不同版本 DOM 很容易变，而且插件主动扫描明文密钥不够干净。更稳妥的做法是让用户临时粘贴/显示 key 后刷新，或做后端扩展/改 ST 源码由后端代查余额。

价格查询和余额查询已经分离；即使余额拿不到，模型价格也会继续显示。
