# --- Stage 1: build the frontend ---
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# --- Stage 2: backend + static files ---
FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev
COPY backend ./
COPY --from=frontend /fe/dist ./public

ENV DATA_DIR=/app/data
ENV PUBLIC_DIR=/app/public
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
