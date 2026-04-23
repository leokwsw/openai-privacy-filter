# OpenAI Privacy Filter API

[English](./README.md) | 简体中文

这是一个基于 [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) 的 FastAPI 封装项目，内置 Docker、Docker Compose，以及 GitHub Container Registry 发布工作流。

如果你想把 OpenAI Privacy Filter 快速部署成一个可调用的本地 API 服务，而不是只在命令行里使用，这个项目就是为这个场景准备的。

## 这个项目解决什么问题

OpenAI Privacy Filter 本身已经提供了很强的本地隐私过滤能力，可以识别并遮盖文本中的敏感信息，例如：

- 人名
- 邮箱
- 电话号码
- 地址
- 日期
- 账号号码
- 私有 URL
- 密钥和令牌

上游仓库主要提供模型、Python 包和 CLI。本项目补上了更适合落地部署的一层：

- 基于 FastAPI 的 REST API
- 支持本地和私有化部署
- 支持 Docker 与 Docker Compose
- 支持 GitHub Actions 自动发布镜像
- 方便接入内部系统、RAG 流程、ETL 流程、文档预处理流程

## 适用场景

- 在把文本发送给大模型前先做 PII 脱敏
- 清洗客服工单、聊天记录、日志、会议纪要
- 文档入库前先做隐私过滤
- 给 AI 应用增加一层隐私网关
- 在合规敏感场景下做本地化文本脱敏

## 功能

- `GET /health` 服务健康检查
- `POST /redact/text` 返回纯文本脱敏结果
- `POST /redact/batch` 批量脱敏，并返回 span、摘要和耗时
- 通过环境变量配置模型设备和 checkpoint
- 支持 Docker 镜像构建
- 支持 Docker Compose 本地启动

## API 说明

### `GET /health`

返回服务状态，以及模型是否已加载。

### `POST /redact/text`

请求示例：

```json
{
  "text": "Alice lives at 1 Main Street and her email is [email protected]"
}
```

响应示例：

```json
{
  "redacted_text": "[PRIVATE_PERSON] lives at [PRIVATE_ADDRESS] and her email is [PRIVATE_EMAIL]",
  "latency_ms": 123.45
}
```

### `POST /redact/batch`

请求示例：

```json
{
  "texts": [
    "Alice was born on 1990-01-02.",
    "Call Bob at +1 415 555 0114."
  ]
}
```

接口会返回每条文本的脱敏结果、检测到的敏感 span、摘要信息和总耗时。

## 快速开始

### 1. 本地 Python 启动

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install ./privacy-filter
python main.py
```

默认启动地址：

```text
http://127.0.0.1:8080
```

### 2. Docker

构建镜像：

```bash
docker build -t openai-privacy-filter .
```

运行容器：

```bash
docker run --rm -p 8080:8080 --env-file .env openai-privacy-filter
```

### 3. Docker Compose

启动服务：

```bash
docker compose up --build
```

后台运行：

```bash
docker compose up --build -d
```

停止服务：

```bash
docker compose down
```

## 环境变量

常用配置：

- `PORT`：API 端口，默认 `8080`
- `OPF_DEVICE`：运行设备，默认 `cpu`
- `OPF_OUTPUT_MODE`：OpenAI Privacy Filter 输出模式，默认 `typed`
- `OPF_CHECKPOINT`：可选，自定义模型 checkpoint 路径

`.env` 示例：

```env
PORT=8080
OPF_DEVICE=cpu
OPF_OUTPUT_MODE=typed
```

## 项目定位

这个仓库不是 OpenAI 官方仓库，而是基于官方 OpenAI Privacy Filter 做的部署封装。

上游官方项目：

- [openai/privacy-filter](https://github.com/openai/privacy-filter)

如果你要看模型本体、训练流程、评测能力，请优先阅读上游项目。  
如果你要尽快把它部署成一个 API 服务，这个仓库更适合直接使用。

## 搜索关键词

OpenAI Privacy Filter API、OpenAI Privacy Filter FastAPI、PII 脱敏 API、PII masking service、self-hosted privacy filter、Docker privacy filter、local PII detection、privacy filter for RAG、privacy filter for LLM preprocessing。

## License

这个仓库是部署封装层，不改变上游模型和代码的授权方式。请以官方项目的许可证说明为准：

- [OpenAI Privacy Filter license](https://github.com/openai/privacy-filter)
