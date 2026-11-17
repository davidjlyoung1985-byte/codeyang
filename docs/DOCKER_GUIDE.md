# Docker 部署指南

## 🐳 快速开始

### 使用 Docker Compose（推荐）

1. **配置环境变量**

```bash
# 复制示例配置
cp .env.docker.example .env

# 编辑配置文件
# Windows: notepad .env
# Linux/Mac: nano .env
```

填入你的配置：
```env
CODEYANG_PROVIDER=deepseek
CODEYANG_API_KEY=your-api-key-here
```

2. **启动容器**

```bash
docker-compose up -d
```

3. **运行任务**

```bash
# 进入交互模式
docker-compose exec codeyang sh

# 或直接运行命令
docker-compose exec codeyang node dist/index.js "实现用户认证"
```

4. **停止容器**

```bash
docker-compose down
```

---

## 🔧 使用 Docker CLI

### 构建镜像

```bash
docker build -t codeyang:latest .
```

### 运行容器

```bash
docker run -it \
  -e CODEYANG_PROVIDER=deepseek \
  -e CODEYANG_API_KEY=your-api-key \
  -v $(pwd)/workspace:/workspace \
  codeyang:latest
```

### 后台运行

```bash
docker run -d \
  --name codeyang \
  -e CODEYANG_PROVIDER=deepseek \
  -e CODEYANG_API_KEY=your-api-key \
  -v $(pwd)/workspace:/workspace \
  codeyang:latest
```

### 查看日志

```bash
docker logs -f codeyang
```

### 停止容器

```bash
docker stop codeyang
docker rm codeyang
```

---

## 📁 目录挂载

### 工作区挂载

```bash
# 挂载当前项目
-v $(pwd):/workspace

# 挂载指定目录
-v /path/to/your/project:/workspace
```

### 配置持久化

```bash
# 使用 Docker volume
-v codeyang-config:/root/.codeyang

# 使用本地目录
-v ~/.codeyang:/root/.codeyang
```

### Git 配置挂载（可选）

```bash
# 共享 Git 配置
-v ~/.gitconfig:/root/.gitconfig:ro
-v ~/.ssh:/root/.ssh:ro
```

---

## 🌐 Web UI 访问

如果启用了 Web UI：

```bash
# 映射端口
docker run -p 3000:3000 ...

# 访问
http://localhost:3000
```

---

## 🚀 高级配置

### 自定义资源限制

编辑 `docker-compose.yml`：

```yaml
deploy:
  resources:
    limits:
      cpus: '4'        # 最多使用 4 核
      memory: 8G       # 最多使用 8GB 内存
    reservations:
      cpus: '2'        # 保证 2 核
      memory: 4G       # 保证 4GB 内存
```

### 使用代理

```bash
# HTTP 代理
-e HTTP_PROXY=http://proxy.example.com:8080
-e HTTPS_PROXY=http://proxy.example.com:8080

# SOCKS5 代理
-e ALL_PROXY=socks5://proxy.example.com:1080
```

### 自定义 Base URL

```bash
-e CODEYANG_BASE_URL=https://your-custom-endpoint.com
```

---

## 🔍 故障排除

### 容器无法启动

```bash
# 查看日志
docker logs codeyang

# 检查配置
docker exec codeyang env | grep CODEYANG
```

### API 连接失败

```bash
# 测试网络
docker exec codeyang ping -c 3 api.deepseek.com

# 验证 API Key
docker exec codeyang node -e "console.log(process.env.CODEYANG_API_KEY)"
```

### 权限问题

```bash
# 在容器内修复权限
docker exec codeyang chown -R node:node /workspace
```

### 构建失败

```bash
# 清理缓存重新构建
docker-compose build --no-cache
```

---

## 📊 监控和维护

### 查看资源使用

```bash
docker stats codeyang
```

### 清理旧镜像

```bash
docker image prune -a
```

### 备份配置

```bash
# 备份 volume
docker run --rm -v codeyang-config:/config -v $(pwd):/backup \
  alpine tar czf /backup/codeyang-config-backup.tar.gz -C /config .

# 恢复 volume
docker run --rm -v codeyang-config:/config -v $(pwd):/backup \
  alpine tar xzf /backup/codeyang-config-backup.tar.gz -C /config
```

### 更新到最新版本

```bash
# 拉取最新代码
git pull

# 重新构建
docker-compose build

# 重启服务
docker-compose up -d
```

---

## 🎯 最佳实践

### 1. 使用 .env 文件

不要在命令行暴露 API Key：
```bash
# ❌ 不推荐
docker run -e CODEYANG_API_KEY=secret-key ...

# ✅ 推荐
# 在 .env 文件中配置
docker-compose up
```

### 2. 持久化数据

使用 Docker volume：
```yaml
volumes:
  - codeyang-config:/root/.codeyang
  - codeyang-cache:/root/.cache
```

### 3. 资源限制

始终设置资源限制，避免占用过多系统资源。

### 4. 健康检查

添加健康检查（可选）：
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "process.exit(0)"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### 5. 日志管理

配置日志驱动：
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

---

## 🔐 安全建议

1. **不要提交 .env 文件**
   ```bash
   # 添加到 .gitignore
   echo ".env" >> .gitignore
   ```

2. **使用密钥管理**
   - Docker Secrets (Swarm mode)
   - Kubernetes Secrets
   - HashiCorp Vault

3. **最小权限原则**
   - 不要使用 root 用户运行
   - 限制容器权限

4. **定期更新**
   - 更新基础镜像
   - 更新依赖包
   - 应用安全补丁

---

## 📦 生产部署

### Docker Swarm

```bash
# 初始化 Swarm
docker swarm init

# 部署服务
docker stack deploy -c docker-compose.yml codeyang

# 查看服务
docker service ls
```

### Kubernetes

参考 `k8s/` 目录中的配置文件（待添加）。

---

## 💡 常见用例

### CI/CD 集成

```yaml
# .gitlab-ci.yml
deploy:
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t codeyang:$CI_COMMIT_SHA .
    - docker run -e CODEYANG_API_KEY=$API_KEY codeyang:$CI_COMMIT_SHA "运行测试"
```

### 批量任务处理

```bash
# 创建任务脚本
cat > tasks.txt << EOF
实现用户认证
编写单元测试
生成 API 文档
EOF

# 批量执行
while read task; do
  docker run --rm \
    -e CODEYANG_API_KEY=$API_KEY \
    -v $(pwd):/workspace \
    codeyang:latest "$task"
done < tasks.txt
```

---

## 📞 获取帮助

- 查看日志: `docker logs codeyang`
- 进入容器: `docker exec -it codeyang sh`
- 提交 Issue: https://github.com/davidjlyoung1985-byte/codeyang/issues

---

**镜像大小**: ~200MB (压缩后)  
**构建时间**: ~2-3 分钟  
**启动时间**: ~5 秒
