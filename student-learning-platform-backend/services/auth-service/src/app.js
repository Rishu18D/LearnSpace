import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "auth-service", mongoUriEnv: "MONGO_AUTH_URI", routes });
app.locals.serviceName = "Auth Service";
export default app;
