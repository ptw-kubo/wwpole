FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev

COPY global_ai_readiness_survey.html ./
COPY server.js ./
COPY admin_dashboard.html ./

EXPOSE 8080
CMD ["node", "server.js"]
