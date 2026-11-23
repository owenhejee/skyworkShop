# skyworkShop

Cursor 标准 Harness 项目，含可运行的**前后端分离**电商示例（Spring Boot + Vue 3）。

## 项目结构

```
harness-project-structure/
├── skyworkshop-backend/     # Spring Boot 后端 API
├── skyworkshop-frontend/    # Vue 3 + Vite 前端
├── .cursor/                # Cursor 规则、Skills、Hooks、MCP
├── docs/                   # 快速入门、维护手册、Wiki
└── AGENTS.md               # AI Agent 项目入口
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Java 17、Spring Boot 3.3、MyBatis-Plus、H2（内存数据库） |
| 前端 | Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router |
| 测试 | JUnit 5（后端）、Maven Surefire |

## 快速开始

### 1. 启动后端（端口 8080）

**要求 JDK 17+**（本机 `JAVA_HOME` 须指向 17，勿用 JDK 8）

推荐（兼容 Windows 中文路径）：

```powershell
# 首次或代码变更后先打包
cd skyworkshop-backend
mvn package -Dmaven.test.skip=true
java -jar target/skyworkshop-backend-1.0.0-exec.jar

# 或使用脚本
.\scripts\start-backend.ps1
```

也可使用 `mvn spring-boot:run`；若报 `ClassNotFoundException: SkyworkShopApplication`，改用上面的 `java -jar`（中文路径下 spring-boot:run 的已知问题）。

验证：

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/products
```

H2 控制台：[http://localhost:8080/h2-console](http://localhost:8080/h2-console)（JDBC URL: `jdbc:h2:mem:skyworkshop`）

### 2. 启动前端（端口 5173）

```bash
cd skyworkshop-frontend
npm install
npm run dev

# 或使用脚本
.\scripts\start-frontend.ps1
```

浏览器打开：[http://localhost:5173](http://localhost:5173)

## 功能模块

- **商品**：分页列表、关键词/分类筛选、详情查询、创建商品
- **购物车**：查看购物车、添加商品（按用户隔离，默认用户 ID 为 1）
- **健康检查**：`GET /health`

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/v1/products` | 商品分页列表 |
| GET | `/api/v1/products/{id}` | 商品详情 |
| POST | `/api/v1/products` | 创建商品 |
| GET | `/api/v1/cart` | 获取购物车（请求头 `X-User-Id`） |
| POST | `/api/v1/cart/items` | 添加商品到购物车 |

统一响应格式：`{ "code": 0, "message": "success", "data": {} }`

## 常用命令

```bash
# 后端
cd skyworkshop-backend && mvn test && mvn package

# 前端
cd skyworkshop-frontend && npm run build && npm run preview
```

## Harness 文档（AI 资产配置）

| 文档 | 说明 |
|------|------|
| [AGENTS.md](AGENTS.md) | 项目入口、红线、文件索引 |
| [5 分钟快速入门](docs/QUICKSTART.md) | 复制提示词即用 |
| [Harness 维护手册](docs/MAINTENANCE.md) | Tech Lead 维护 |
| [接口协议](docs/wiki/接口协议.md) | API 协议 Wiki |
| [工程结构规范](.cursor/rules/工程结构.mdc) | 模块架构与命名 |

推荐 AI 流水线：

```text
@request-analysis → @coding-skill → @expert-reviewer
```

## 开发说明

- 后端使用 H2 内存数据库，重启后数据会重置。
- 前端开发时通过 Vite 代理访问后端，无需额外配置 CORS。
- 购物车用户标识通过请求头 `X-User-Id` 传递，未传时默认使用用户 `1`。
- 数据库表结构见 `skyworkshop-backend/src/main/resources/schema.sql`，初始数据见 `data.sql`。

## 许可证

MIT
