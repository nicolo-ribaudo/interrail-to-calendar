# syntax=docker/dockerfile:1

# ---- Build ----
FROM node:26-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime ----
# The Nitro node-server build in .output/ is self-contained (dependencies are
# bundled), so the runtime image needs only Node — no node_modules.
FROM node:26-slim
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

# Railway injects PORT at runtime; the server reads it.
CMD ["node", ".output/server/index.mjs"]
