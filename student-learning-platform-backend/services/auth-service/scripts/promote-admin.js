import mongoose from "mongoose";
import "../../../shared/load-env.js";
import User from "../src/model.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:promote -w auth-service -- user@example.com");
  process.exit(1);
}
if (!process.env.MONGO_AUTH_URI) {
  console.error("MONGO_AUTH_URI must be configured in the backend root .env file.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_AUTH_URI, { serverSelectionTimeoutMS: 5000 });
  const result = await User.updateOne({ email }, { $set: { role: "admin" } });
  if (result.matchedCount === 0) throw new Error(`No account found for ${email}. Register that account first.`);
  console.log(`Promoted ${email} to admin. Sign in again to receive the new role in your access token.`);
} catch (error) {
  console.error(`Could not promote admin account: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
