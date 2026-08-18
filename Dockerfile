FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 1001 radio

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY .env.example ./

RUN mkdir -p /app/data && chown -R radio:radio /app
USER radio

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/radio.db
ENV LOG_PRETTY=0

VOLUME ["/app/data"]
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
