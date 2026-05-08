# TFSA 存取记录

本地网页工具，用来记录 TFSA 每次存款与取款，并按年度查看是否接近或超过可用额度。

## 快捷打开

在 macOS 上可以直接双击：

```text
TFSA.command
```

它会自动：

- 启动本地服务
- 打开浏览器到 `http://localhost:3000`
- 保持一个终端窗口打开

要关闭 TFSA，直接关闭这个终端窗口，或在窗口里按 `Ctrl+C`。服务会一起停止。

服务日志在：

```text
tfsa-server.log
```

## 运行

```bash
npm start
```

默认地址：

```text
http://localhost:3000
```

## GitHub Pages 只读共享版

生成静态发布文件：

```bash
npm run build:pages
```

生成结果在：

```text
docs/
```

这个版本适合 GitHub Pages：它不运行 `server.js`，而是读取 `docs/static-data.json` 中的快照数据，并隐藏新增、编辑、删除入口。

### 自动发布

本仓库包含 GitHub Actions 工作流：

```text
.github/workflows/pages.yml
```

启用后，每次推送到 `main` 分支，GitHub 会自动运行 `npm run build:pages`，并把生成的 `docs/` 发布到 GitHub Pages。

在 GitHub 仓库中启用 Pages 自动发布：

1. 打开仓库 Settings。
2. 进入 Pages。
3. Source 选择 `GitHub Actions`。
4. 保存后等待下一次 push 或手动运行 workflow。

之后每次本地数据更新后，只需要提交并推送 `data/tfsa-data.json`。GitHub Actions 会自动生成最新网页数据。

### 手动发布

如果不想用 GitHub Actions，也可以在 Pages 设置中选择 `Deploy from a branch`，Branch 选择 `main`，目录选择 `/docs`。这种方式下，每次本地数据更新后，需要先运行 `npm run build:pages`，再提交并推送 `docs/` 目录。

## 数据文件

数据默认保存在：

```text
data/tfsa-data.json
```

结构示例：

```json
{
  "years": {
    "2026": {
      "year": 2026,
      "startingContributionRoom": 7000,
      "transactions": [
        {
          "id": "example-id",
          "date": "2026-01-15",
          "type": "contribution",
          "amount": 5000,
          "note": "January deposit"
        }
      ]
    }
  }
}
```

## 功能

- 录入 TFSA 存款和取款
- 按年份查看历史记录
- 显示本年起始额度、已存入、已取出、当前剩余额度、超额金额
- 显示“明年预计返还额度”
- 支持编辑和删除记录

## 测试

```bash
npm test
```
