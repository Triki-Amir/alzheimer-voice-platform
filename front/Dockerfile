# Dev-mode Dockerfile: runs `next dev` with hot reload via a bind mount
# (see docker-compose.yml). Not meant for production — for that, switch to
# a multi-stage build with `next build` + `next start`.
FROM node:22-alpine

WORKDIR /app

# Installed separately so this layer is cached until package.json changes
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]