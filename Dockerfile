FROM ghcr.io/puppeteer/puppeteer:19.11.1

USER root
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

CMD [ "node", "bot.js" ]
