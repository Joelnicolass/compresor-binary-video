FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
  for i in 1 2 3; do \
    apt-get update && \
    if apt-get install -y --no-install-recommends ffmpeg python3; then \
      rm -rf /var/lib/apt/lists/*; \
      break; \
    fi; \
    echo "apt-get failed, retrying... ($i/3)"; \
    sleep 3; \
  done; \
  command -v ffmpeg >/dev/null; \
  command -v python3 >/dev/null

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p tmp/uploads tmp/outputs tmp/decoded tmp/downloads

EXPOSE 3000
CMD ["npm", "start"]
