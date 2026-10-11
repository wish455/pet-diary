# 铲屎官日记 · 宠物管理系统
# 零第三方依赖：只用 Node.js 内置模块，镜像基于 node:22-alpine
FROM node:22-alpine

# 时区（日志与日期更符合国内习惯；容器内不写死业务时区，仅影响日志）
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
# 数据目录：数据库与上传图片都放在这里，部署时必须挂载持久磁盘
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app

# 先拷贝代码（本项目无依赖安装步骤）
COPY package.json ./
COPY server ./server
COPY js ./js
COPY index.html styles.css README.md ./

# 运行期以非 root 用户运行，降低风险
RUN mkdir -p /data/uploads && addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs petapp && chown -R petapp:nodejs /data /app
USER petapp

EXPOSE 3000

# 健康检查：平台可据此判断服务是否存活
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
