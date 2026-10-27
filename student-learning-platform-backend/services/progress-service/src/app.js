import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "progress-service", mongoUriEnv: "MONGO_PROGRESS_URI", routes });
app.locals.serviceName = "Progress Service";
export default app;
