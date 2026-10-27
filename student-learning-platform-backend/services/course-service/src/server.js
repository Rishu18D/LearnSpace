import app from "./app.js";
import { connectCourseCache, disconnectCourseCache } from "./cache.js";
import { startService } from "@slp/common/service-app";

async function start() {
  try {
    await connectCourseCache();
    await startService(app, Number(process.env.PORT || 3003), { onShutdown: disconnectCourseCache });
  } catch (error) {
    try {
      await disconnectCourseCache();
    } catch (shutdownError) {
      console.error("Course cache shutdown failed", shutdownError);
    }
    console.error(error);
    process.exit(1);
  }
}

start();
