# SillyTavern New API Key Info

在 `Custom (OpenAI-compatible)` 连接页显示 new-api 的当前模型价格和密钥余额。

## TauriTavern 用法

TauriTavern 只需要安装这个前端扩展，不需要也不能安装 Node 后端插件。插件列表里只出现 `New API Key Info` 是正常的。

安装方式：

- 通过 TauriTavern 的第三方扩展管理器导入本仓库。
- 或手动放到 `data/default-user/extensions/sillytavern-new-api-key-info`。
- 也可以放到全局目录 `data/extensions/third-party/sillytavern-new-api-key-info`。

启用扩展后，选择 `Chat Completion Source = Custom (OpenAI-compatible)`，填写 Custom Endpoint。插件会在面板出现后自动刷新一次，也可以点击面板里的 `刷新`。

## 价格显示

价格来自 new-api 的：

```text
GET /api/pricing
```

插件会把你填写的地址自动归一化。例如：

```text
https://example.com/v1
https://example.com/api/pricing
https://example.com/v1/chat/completions
```

都会推导为：

```text
https://example.com/api/pricing
```

切换模型时不会重新请求余额，只会用已缓存的价格数据重新显示当前模型价格。

## 余额显示

余额来自 new-api 的：

```text
GET /api/usage/token
```

TauriTavern 默认禁止第三方前端扩展读取已经隐藏保存的 API key。这是 TauriTavern 的安全策略，不是插件能绕过的逻辑。

余额能显示的情况：

- 输入框里还有完整 key，例如刚填完 key、还没被隐藏时。
- TauriTavern 设置里开启了 `Allow Keys Exposure`，重启后允许 `/api/secrets/find` 暴露 key。

余额不能显示的情况：

- key 已保存并隐藏。
- `Allow Keys Exposure` 仍是默认关闭。

这种情况下插件会继续显示价格，但余额会提示 TauriTavern 禁止读取隐藏密钥。

## 原版 SillyTavern

原版 SillyTavern 也可以只安装前端扩展，但前端同样不能读取隐藏保存的 key。若要在 key 已隐藏时查询余额，可额外安装仓库里的可选 Server Plugin：

```text
server-plugin/newapi-key-info
```

把它复制到 SillyTavern 根目录：

```text
SillyTavern/plugins/newapi-key-info
```

并在 `config.yaml` 开启：

```yaml
enableServerPlugins: true
```

TauriTavern 不支持 SillyTavern 的 Node-only backend plugins，因此这个目录只给原版 SillyTavern 使用。

## new-api 接口要求

- `GET /api/pricing`
- `GET /api/usage/token`

如果价格显示为请求失败，请先确认浏览器或 TauriTavern 能访问你的 new-api 地址，并且该服务允许当前客户端请求。
