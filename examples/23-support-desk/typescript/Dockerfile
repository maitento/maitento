# The TypeScript support desk in a container. Build it from the example's folder, so web/ and data/ come along:
#
#   docker build -f typescript/Dockerfile -t acme-support-desk .
#   docker run -p 3000:3000 -v desk-state:/app/state \
#     -e MAITENTO_API_KEY -e MAITENTO_NAMESPACE -e SHOP_API_KEY -e WEBHOOK_SECRET acme-support-desk
#
# The image also holds setup.ts and the Maitento project, so `docker run … acme-support-desk node setup.ts` sets up
# Maitento from the same image (it needs WEBHOOK_URL as well).
FROM node:22-slim

WORKDIR /app/typescript
COPY typescript/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY typescript/*.ts ./
COPY web ../web
COPY data ../data
COPY knowledge ../knowledge
COPY maitento ../maitento

# The tickets and orders are kept in a volume, so they outlive the container.
RUN mkdir -p /app/state && chown node /app/state
VOLUME /app/state
ENV NODE_ENV=production PORT=3000 DESK_FILE=/app/state/desk.json

USER node
EXPOSE 3000
CMD ["node", "server.ts"]
