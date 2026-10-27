import app from "./app.js";
import { startService } from "@slp/common/service-app";
import { startConsumer } from "./consumer.js";
const port=Number(process.env.PORT||3005);
startService(app,port).then(()=>startConsumer()).catch(err=>{console.error("Notification service startup failed:",err);process.exit(1);});
