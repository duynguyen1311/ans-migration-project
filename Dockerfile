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

# Bundle app source
COPY . .

# Create logs directory with proper permissions
RUN mkdir -p logs && chmod -R 755 logs

# Run the application using npm script
CMD [ "npm", "run", "schedule" ]