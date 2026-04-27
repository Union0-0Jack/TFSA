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
