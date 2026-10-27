import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "enrollment-service", mongoUriEnv: "MONGO_ENROLLMENTS_URI", routes });
app.locals.serviceName = "Enrollment Service";
export default app;
