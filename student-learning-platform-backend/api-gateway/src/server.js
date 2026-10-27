import app from "./app.js";
const port=Number(process.env.PORT||process.env.GATEWAY_PORT||3000);
const server=app.listen(port,()=>console.log(`API Gateway listening on ${port}`));
const shutdown=()=>server.close(()=>process.exit(0));
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
