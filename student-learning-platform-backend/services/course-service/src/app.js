import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "course-service", mongoUriEnv: "MONGO_COURSES_URI", routes, jsonLimit: "5mb" });
app.locals.serviceName = "Course Service";
export default app;
