# ==========================================================================
# 邻里鲜生 · 单容器部署 (前后端 + SQLite 一体)
# ==========================================================================
FROM node:20-bookworm-slim

# better-sqlite3 编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖清单, 利用 Docker 缓存层
COPY server/package.json server/package-lock.json* ./server/

# 安装后端依赖 (仅生产依赖)
RUN cd server && npm install --omit=dev

# 复制项目代码 (前端 + 后端)
COPY server/ ./server/
COPY web/ ./web/
COPY admin/ ./admin/
COPY leader/ ./leader/

# 启动脚本 (修复 Windows CRLF 行尾)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# 数据库持久化目录
RUN mkdir -p /app/server/data
ENV DB_PATH=/app/server/data/linli_fresh.db

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/app.js"]
