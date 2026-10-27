import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "analytics-service", mongoUriEnv: "MONGO_ANALYTICS_URI", routes });
app.locals.serviceName = "Analytics Service";
export default app;
