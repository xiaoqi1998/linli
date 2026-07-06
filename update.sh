#!/bin/bash
# 邻里鲜生 · 一键更新脚本 (代码)
# 前置: docker-compose.yml 已配置代码 bind mount
# 用法: bash /opt/linli-fresh/update.sh
set -e
cd /opt/linli-fresh

echo "==> 拉取最新代码"
git pull

echo "==> 重启服务 (bind mount 的代码自动生效, 无需 rebuild)"
docker compose -f /opt/linli-fresh/docker-compose.yml restart linli-fresh

echo "✅ 代码更新完成"
echo "提示: 若图片素材(server/uploads)有变动, 需从本地 rsync 到本机 /opt/linli-fresh/server/uploads/"
