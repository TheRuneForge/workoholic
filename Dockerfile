# Self-hosted copy: the Worker runs in wrangler's local runtime and keeps its
# data in /data. No Cloudflare account is needed. The libraries are what the
# bundled Chrome needs to start.
# The latest Ubuntu LTS by digest; Renovate moves the digest. Node comes from the
# Ubuntu archive as the unversioned package, so the image gets the series the
# release ships (22 on 26.04) and the next release's series on its own.
FROM ubuntu:latest@sha256:d66b366dac61b575bee2aef07e9c26e8070096fbe84a3d4d3eb0da069b5d76db
# apt-get upgrade applies the maintenance and security fixes Ubuntu has published
# since the base image digest was built.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates nodejs npm \
    fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/app
COPY . .
RUN npm ci --ignore-scripts --legacy-peer-deps
RUN mkdir -p /data /srv && chown ubuntu:ubuntu /data /srv
USER ubuntu
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
