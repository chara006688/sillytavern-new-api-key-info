# SillyTavern New API 密钥信息

这是一个 SillyTavern 前后端组合插件，用于聊天补全的 `Custom (OpenAI-compatible)` 连接页面。
它会显示 new-api 模型价格和当前密钥余额，并优先由后端读取 SillyTavern 已保存的 `api_key_custom`。

## 功能

- 仅面向 new-api。
- 前端 UI 扩展在连接配置区域显示模型、价格、余额和数据来源。
- 后端 Server Plugin 读取 SillyTavern 保存的 Custom API 密钥。
- 点击连接后，等待模型列表加载完成，再获取当前模型价格和余额。
- 支持按次价格和按量价格显示。
- 后端插件不可用时，会自动退回前端模式。
- 前端模式只能读取页面里可见的完整 API key；如果 ST 隐藏保存的 key，就不能查余额。
- 黑底白字显示，尽量不受 SillyTavern 主题影响。

## 安装前端 UI 扩展

把本仓库导入 SillyTavern / TauriTavern 的第三方扩展管理器，或手动复制到扩展目录：

- `SillyTavern/data/default-user/extensions/sillytavern-new-api-key-info`
- `SillyTavern/public/scripts/extensions/third-party/sillytavern-new-api-key-info`

然后重启 SillyTavern，或刷新浏览器页面，并在扩展管理里启用 `New API 密钥信息`。

## 安装后端 Server Plugin

SillyTavern 的 Server Plugin 必须放在 SillyTavern 根目录的 `plugins` 目录中，不能只放在前端扩展目录里。

把仓库里的这个目录：

```text
server-plugin/newapi-key-info
```

复制到 SillyTavern 根目录：

```text
SillyTavern/plugins/newapi-key-info
```

然后在 `config.yaml` 开启：

```yaml
enableServerPlugins: true
```

重启 SillyTavern。启动日志里应能看到：

```text
[new-api-key-info] server plugin loaded
```

后端接口会挂载到：

```text
/api/plugins/newapi-key-info/summary
```

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

前端扩展无法读取 ST 隐藏的已保存 key。

安装后端 Server Plugin 后，插件会在后端读取当前用户目录里的 `secrets.json`，获取 `api_key_custom` 当前激活的密钥，再请求 new-api 的余额接口。因此后端模式可以查询隐藏密钥的余额。

如果面板显示 `前端模式`，说明后端插件没有安装、没有启用，或请求后端接口失败。
如果面板显示 `后端模式`，说明余额查询已经走后端。

## 安全提示

Server Plugin 不在浏览器沙盒内运行，可以读取 SillyTavern 用户目录中的密钥文件。
只安装你信任的后端插件，并避免把包含真实密钥的日志发给别人。
