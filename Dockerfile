FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm install

# Set timezone to Vietnam (Asia/Ho_Chi_Minh)
RUN apk add --no-cache tzdata
RUN cp /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime
RUN echo "Asia/Ho_Chi_Minh" > /etc/timezone

# Bundle app source - be explicit about copying all directories
COPY . .

# Ensure the config.js file is in the proper location
RUN ls -la && \
    echo "Checking if config.js exists:" && \
    ls -la config.js || echo "config.js not found!"

# Create logs directory with proper permissions
RUN mkdir -p logs && chmod -R 755 logs

# Run the application using npm script
CMD [ "npm", "run", "schedule" ]