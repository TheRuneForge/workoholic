# Self-hosted copy: the Worker runs in wrangler's local runtime and keeps its
# data in /data. No Cloudflare account is needed. The libraries are what the
# bundled Chrome needs to start.
FROM ubuntu:latest
RUN apt-get update && apt-get install --yes --no-install-recommends \
    ca-certificates fonts-liberation \
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libcairo2 libcups2t64 \
    libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0t64 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxrandr2 \
    nodejs npm \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system node \
  && useradd --system --gid node --home-dir /home/node --create-home node
WORKDIR /opt/app
COPY . .
RUN npm ci --ignore-scripts --legacy-peer-deps
RUN mkdir -p /data /srv && chown node:node /data /srv
USER node
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
