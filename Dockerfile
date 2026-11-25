FROM node:20-bookworm

RUN apt-get update && apt-get install -y wget gnupg unzip \
  && wget -q -O /usr/share/keyrings/google-chrome.asc https://dl.google.com/linux/linux_signing_key.pub \
  && echo "deb [signed-by=/usr/share/keyrings/google-chrome.asc] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y google-chrome-stable fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @testmuai/kane-cli tsx

WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json .env.judge ./
COPY packages ./packages
COPY apps ./apps
COPY deploy ./deploy
RUN npm ci && npx tsc -b && chmod +x deploy/start.sh

ENV NODE_ENV=production
EXPOSE 4040
CMD ["bash", "deploy/start.sh"]
