FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm --filter secure-service-desk-api install --frozen-lockfile --ignore-scripts

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm --filter secure-service-desk-api install --prod --frozen-lockfile --ignore-scripts \
  && corepack disable \
  && rm -rf /root/.cache/node/corepack /root/.cache/pnpm /root/.local/share/pnpm \
    /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
  && rm -f /app/pnpm-lock.yaml /app/pnpm-workspace.yaml \
    /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
