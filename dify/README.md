# Dify AI 平台部署指南

> 心音智鉴 AI 健康助手平台

本指南将帮助你完成 Dify AI 平台的部署和配置，包括健康问答 Chatflow 和智能报告生成 Workflow。

## 目录

- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [详细配置](#详细配置)
- [LLM Provider 配置](#llm-provider-配置)
- [知识库配置](#知识库配置)
- [应用创建](#应用创建)
- [API 集成](#api-集成)
- [常见问题](#常见问题)

## 系统要求

### 硬件要求

| 配置项 | 最低配置 | 推荐配置 |
|--------|----------|----------|
| CPU | 2核 | 4核 |
| 内存 | 4GB | 8GB |
| 存储 | 40GB SSD | 100GB SSD |
| 带宽 | 5Mbps | 10Mbps |

### 软件要求

- **操作系统**: Ubuntu 22.04 / CentOS 8 / macOS
- **Docker**: 24.0+
- **Docker Compose**: 2.0+

## 快速开始

### 1. 准备环境

```bash
# 安装 Docker (Ubuntu)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo apt-get install docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

### 2. 配置环境变量

```bash
cd dify

# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env
```

**必须修改的配置**:
- `SECRET_KEY`: 应用密钥，使用随机字符串
- `DB_PASSWORD`: 数据库密码

**生产环境还需修改**:
- `CONSOLE_WEB_URL`: 控制台 URL
- `CONSOLE_API_URL`: API URL
- `SERVICE_API_URL`: 服务 API URL

### 3. 启动服务

```bash
# 给部署脚本添加执行权限
chmod +x deploy.sh

# 启动服务
./deploy.sh start
```

### 4. 访问控制台

打开浏览器访问: `http://your-server-ip`

首次访问需要创建管理员账号。

## 详细配置

### 目录结构

```
dify/
├── docker-compose.yml    # Docker Compose 配置
├── .env.example          # 环境变量模板
├── .env                  # 环境变量（需自行创建）
├── nginx.conf            # Nginx 配置
├── deploy.sh             # 部署脚本
├── README.md             # 本文档
├── knowledge-base/       # 知识库文档
│   ├── 心脏基础知识.md
│   ├── 常见心脏问题.md
│   ├── 健康生活建议.md
│   ├── 就医指导.md
│   └── 心音检测说明.md
├── prompts/              # 提示词模板
│   ├── health_qa_system_prompt.md
│   └── health_report_prompt.md
├── storage/              # 文件存储（自动创建）
└── ssl/                  # SSL 证书（可选）
```

### 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| nginx | 80/443 | 反向代理入口 |
| api | 5001 | Dify API 服务 |
| worker | - | 异步任务处理 |
| web | 3000 | Web 控制台 |
| db | 5432 | PostgreSQL 数据库 |
| redis | 6379 | Redis 缓存 |
| weaviate | 8080 | 向量数据库 |

### 部署脚本命令

```bash
./deploy.sh start     # 启动服务
./deploy.sh stop      # 停止服务
./deploy.sh restart   # 重启服务
./deploy.sh status    # 查看状态
./deploy.sh logs      # 查看日志
./deploy.sh logs api  # 查看指定服务日志
./deploy.sh pull      # 拉取最新镜像
./deploy.sh clean     # 清理数据（危险）
```

## LLM Provider 配置

### 推荐: DeepSeek-V3

1. 访问 [DeepSeek 平台](https://platform.deepseek.com) 注册账号
2. 创建 API Key
3. 在 Dify 控制台配置:
   - 进入 **设置** -> **模型供应商**
   - 点击 **添加模型**
   - 选择 **OpenAI-API-compatible**
   - 填写配置:
     - **供应商名称**: DeepSeek
     - **API Base URL**: `https://api.deepseek.com/v1`
     - **API Key**: 你的 DeepSeek API Key
     - **Model**: `deepseek-chat`

### 备选: 通义千问

1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com) 开通服务
2. 创建 API Key
3. 在 Dify 控制台:
   - 进入 **设置** -> **模型供应商**
   - 选择 **通义千问**
   - 填写 API Key

### 成本参考

| 模型 | 价格 | 推荐场景 |
|------|------|----------|
| DeepSeek-V3 | 约 ¥0.5/100K tokens | 日常使用，性价比高 |
| 通义千问 | 约 ¥0.8/100K tokens | 国内备选 |
| GPT-4 | 约 $0.03/1K tokens | 高质量需求 |

## 知识库配置

### 1. 创建知识库

1. 进入 Dify 控制台
2. 点击 **知识库** -> **创建知识库**
3. 名称: `心脏健康知识库`
4. 描述: `心音智鉴心脏健康科普知识`

### 2. 上传文档

将 `knowledge-base/` 目录下的 5 个文档上传到知识库:
- 心脏基础知识.md
- 常见心脏问题.md
- 健康生活建议.md
- 就医指导.md
- 心音检测说明.md

### 3. 配置索引

- **分段策略**: 自动分段
- **最大分段长度**: 500 tokens
- **检索模型**: 混合检索

## 应用创建

### 应用一: 健康问答 Bot (Chatflow)

1. 进入 **工作室** -> **创建应用**
2. 选择 **Chatflow**
3. 名称: `心音健康助手`

#### 配置 System Prompt

复制 `prompts/health_qa_system_prompt.md` 的内容到 System Prompt。

#### 配置知识库

1. 在流程中添加 **知识检索** 节点
2. 选择 `心脏健康知识库`
3. 配置检索参数:
   - 相似度阈值: 0.7
   - 返回数量: 3

#### 发布并获取 API Key

1. 点击 **发布**
2. 进入 **API 访问**
3. 创建 API 密钥并保存

### 应用二: 智能报告生成 (Workflow)

1. 进入 **工作室** -> **创建应用**
2. 选择 **Workflow**
3. 名称: `智能健康报告生成`

#### 配置输入变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| user_id | String | 用户 ID |
| report_type | String | 报告类型 |
| period_start | String | 起始日期 |
| period_end | String | 结束日期 |
| detection_stats | String | 统计数据 JSON |
| detection_records | String | 检测记录 JSON |
| generation_date | String | 生成日期 |

#### 配置 LLM 节点

复制 `prompts/health_report_prompt.md` 的内容作为提示词模板。

#### 发布并获取 API Key

1. 点击 **发布**
2. 进入 **API 访问**
3. 创建 API 密钥并保存

## API 集成

### 健康问答 API

```bash
curl -X POST 'http://your-domain/v1/chat-messages' \
  -H 'Authorization: Bearer app-xxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "inputs": {},
    "query": "心率多少算正常？",
    "response_mode": "blocking",
    "user": "user-001"
  }'
```

### 报告生成 API

```bash
curl -X POST 'http://your-domain/v1/workflows/run' \
  -H 'Authorization: Bearer app-xxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "inputs": {
      "user_id": "user-001",
      "report_type": "weekly",
      "period_start": "2026-01-01",
      "period_end": "2026-01-07",
      "detection_stats": "{\"total_detections\": 10, \"normal_count\": 9}",
      "generation_date": "2026-01-08T10:00:00Z"
    },
    "response_mode": "blocking",
    "user": "user-001"
  }'
```

### 小程序配置

将获取的 API Key 配置到小程序:

```javascript
// miniprogram/config/dify.js
module.exports = {
  baseUrl: 'http://your-domain/v1',
  chatflowApiKey: 'app-xxxxx',  // 健康问答 API Key
  workflowApiKey: 'app-xxxxx',  // 报告生成 API Key
  // ...
};
```

## 常见问题

### Q1: 服务启动失败

检查步骤:
1. 确认 Docker 服务正常运行
2. 检查端口是否被占用: `netstat -tlnp | grep -E '80|443'`
3. 查看日志: `./deploy.sh logs`

### Q2: 无法连接数据库

检查步骤:
1. 确认数据库容器运行: `docker ps | grep dify-db`
2. 检查数据库密码配置是否正确
3. 尝试重启服务: `./deploy.sh restart`

### Q3: API 返回 401

原因: API Key 无效或过期
解决: 重新创建 API Key 并更新配置

### Q4: 知识库检索不准确

优化方法:
1. 调整分段策略
2. 优化知识库文档内容
3. 调整检索相似度阈值

### Q5: 响应速度慢

优化方法:
1. 使用更快的 LLM 模型
2. 增加服务器配置
3. 开启 Redis 缓存
4. 使用流式响应模式

## 安全建议

1. **修改默认密码**: 部署后立即修改所有默认密码
2. **使用 HTTPS**: 生产环境必须配置 SSL 证书
3. **限制访问**: 配置防火墙规则，仅开放必要端口
4. **定期备份**: 定期备份数据库和知识库
5. **监控日志**: 监控异常访问和错误日志

## 技术支持

如有问题，请参考:
- [Dify 官方文档](https://docs.dify.ai)
- [Dify GitHub](https://github.com/langgenius/dify)
- 项目 Issues

---

*最后更新: 2026-01-26*
