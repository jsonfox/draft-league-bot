# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=20.9.0

FROM node:${NODE_VERSION}-alpine as base

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR /usr/src/app

FROM base as builder

RUN apk add --no-cache git
RUN apk add --no-cache openssh

RUN git clone https://github.com/jsonfox/draft-league-bot.git .

RUN npm ci --omit=dev

FROM base

# Run the application as a non-root user.
USER node

# Copy the rest of the source files into the image.
COPY --from=builder /usr/src/app .

# Run the application.
CMD npm run build && npm start
