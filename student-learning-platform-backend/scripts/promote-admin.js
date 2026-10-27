import "../shared/load-env.js";
import mongoose from "mongoose";
import User from "../services/auth-service/src/model.js";

const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
if(!email || process.env.CONFIRM_ADMIN_EMAIL?.trim().toLowerCase()!==email) {
  throw new Error("Set ADMIN_EMAIL and CONFIRM_ADMIN_EMAIL to the same existing account email before provisioning.");
}
if(!process.env.MONGO_AUTH_URI) throw new Error("MONGO_AUTH_URI must be configured.");

await mongoose.connect(process.env.MONGO_AUTH_URI,{serverSelectionTimeoutMS:5000});
try {
  const user=await User.findOneAndUpdate({email},{$set:{role:"admin"}},{new:true,runValidators:true});
  if(!user) throw new Error(`No existing account was found for ${email}. Register and verify the account first.`);
  console.info(JSON.stringify({level:"info",event:"admin.provisioned",userId:user.id,email:user.email}));
} finally {
  await mongoose.disconnect();
}
