FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install
COPY screenshot.js ./

CMD ["/bin/bash", "-c", "while true; do node /app/screenshot.js; sleep 360; done"]
