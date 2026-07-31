FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
  && pnpm store prune

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
