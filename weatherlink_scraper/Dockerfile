FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install
COPY scrape.js ./

CMD ["/bin/bash", "-c", "while true; do node /app/scrape.js; sleep 360; done"]
