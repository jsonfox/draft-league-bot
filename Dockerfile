# syntax=docker/dockerfile:1

ARG NODE_VERSION=20.9.0

ARG DIR=/usr/src/app

#Build stage
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR ${DIR}

COPY package*.json .

RUN npm install

COPY . .

RUN npm run build

#Production stage
FROM node:${NODE_VERSION}-alpine AS production

WORKDIR ${DIR}

COPY package*.json .

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=build ${DIR}/dist ./dist

CMD ["node", "dist/index.js"]