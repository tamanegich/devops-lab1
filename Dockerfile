FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "server.js", \
     "--port", "3000", \
     "--db-host", "db", \
     "--db-port", "3306", \
     "--db-user", "taskuser", \
     "--db-password", "taskpassword", \
     "--db-name", "taskdb"]
