# NEDL Server

This server is a containerized application built as a microservice for the main Draft League app. 

I also wanted to use it as an opportunity to build my own services without using frameworks such as Discord.js and Express (I plan to replace SocketIO implementation in the future). While the source code for the main application isn't public, I wanted to make this public as example code for making a Discord gateway bot without using Discord.js, and an HTTP server without using Express.


## Features

### Discord Client

**Problem**: Discord interactions have a 3 second timeout window for the application to acknowledge the interaction. Since the main app is a serverless application, I ended up encountering a major issue when adding interaction handling to the NextjS app: serverless function cold starts would sometimes exceed the 3 second response window. I also wanted to maintain the logic for specific interaction handlers within the code for the main app.

**Solution**: I decided to create a process that would stay connected to the Discord gateway, thus always online to handle interactions. This client acts as an intermediary that receives interactions from the Discord gateway and immediately sends a deferred response to the user on Discord, indicating a loading state. This app then forwards the interaction payload to the main application via REST. If the HTTP response indicates an error, this app will update the loading state and send an error message to the user Discord. Otherwise, the main app will handle updating the interaction response.


### Broadcast Server

**Problem**: I wanted to add a dynamic overlay that could be used as an OBS Browser Source for stream overlays. For the overlay to receive updates after the initial page load, it would need to utilize WebSockets. Due to the serverless architecture of the main application, I couldn't just add a WebSocket server inside the NextJS app.

**Solution**: Since I was already using a process for the Discord client, I decided to add HTTP and WebSocket servers to this app. These are currently used for REST endpoints and a SocketIO server for managing the stream overlay. I created a server framework similar to Express that can be expanded upon in the future as more features are added.