const { init } = require("./client");
const http = require("http");
const port = process.env.PORT || 3000;

http
  .createServer(function (req, res) {
    res.write("meow");
    res.end();
  })
  .listen(port, () => {
    console.log(`Server running on port ${port}`);
    init();
  });
