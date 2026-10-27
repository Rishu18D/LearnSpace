import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "notification-service", mongoUriEnv: "MONGO_NOTIFICATIONS_URI", routes });
app.locals.serviceName = "Notification Service";
export default app;
