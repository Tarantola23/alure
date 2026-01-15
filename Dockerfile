FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma
RUN cd server && npm ci
COPY server ./server
RUN cd server && npx prisma generate
RUN cd server && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
RUN cd server && npx prisma generate
EXPOSE 8080
CMD ["node", "server/dist/main.js"]
