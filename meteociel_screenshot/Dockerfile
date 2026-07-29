FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install
COPY screenshot.js ./
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD [ "/run.sh" ]
