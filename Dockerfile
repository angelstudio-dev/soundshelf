FROM node:22-alpine AS builder
WORKDIR /build
COPY server/package*.json ./server/
COPY web/package*.json ./web/
RUN npm --prefix server ci --omit=dev || npm --prefix server install
RUN npm --prefix web ci || npm --prefix web install
COPY server ./server
COPY web ./web
RUN npm --prefix server run build && npm --prefix web run build

FROM node:22-alpine AS deps
WORKDIR /deps
COPY server/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg
COPY --from=deps /deps/node_modules ./server/node_modules
COPY --from=builder /build/server/dist ./server/dist
COPY --from=builder /build/server/package.json ./server/package.json
COPY --from=builder /build/web/dist ./web/dist
RUN mkdir -p /app/data /media/books
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/server.js"]
