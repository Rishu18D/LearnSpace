import { createApp } from "@slp/common/service-app";
import routes from "./routes.js";
const app = createApp({ name: "student-service", mongoUriEnv: "MONGO_STUDENTS_URI", routes });
app.locals.serviceName = "Student Service";
export default app;
