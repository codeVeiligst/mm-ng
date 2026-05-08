FROM node:20-alpine@sha256:cb3143549582cc5f74f26f0992cdef4a422b22128cb517f94173a5f910fa4ee7 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html postcss.config.js tailwind.config.js tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE NOTICE THIRD-PARTY-NOTICES.md /usr/share/nginx/html/
