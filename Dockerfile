FROM node:20-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p tmp/uploads tmp/outputs tmp/decoded tmp/downloads

EXPOSE 3000
CMD ["npm", "start"]
