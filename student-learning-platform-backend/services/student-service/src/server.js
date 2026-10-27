import app from "./app.js";
import { startService } from "@slp/common/service-app";
startService(app, Number(process.env.PORT || 3001)).catch(err => { console.error(err); process.exit(1); });
