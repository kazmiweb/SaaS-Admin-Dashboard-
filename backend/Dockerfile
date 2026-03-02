FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run prisma:generate
EXPOSE 8080
CMD ["npm","run","start"]
