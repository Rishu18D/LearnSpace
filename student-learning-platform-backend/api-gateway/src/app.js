import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { corsOrigins } from "@slp/common";
import "../../shared/load-env.js";

const app=express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY_HOPS !== undefined) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(hops) || hops < 0) throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
  app.set("trust proxy", hops);
}
app.use(helmet());
app.use(cors({origin:corsOrigins(),credentials:true}));
app.use((req,res,next)=>{
  const suppliedId=req.headers["x-request-id"];
  const id=typeof suppliedId==="string"&&/^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId)?suppliedId:randomUUID();
  req.headers["x-client-ip"]=req.ip;
  req.headers["x-request-id"]=id;res.setHeader("x-request-id",id);next();
});
app.use(morgan("combined"));
app.use(rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:true,legacyHeaders:false}));
app.use("/api/auth/login",rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false}));
app.use("/api/auth/register",rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:true,legacyHeaders:false}));
app.get("/health/live",(req,res)=>res.json({service:"api-gateway",status:"alive"}));
const services=[
  ["/api/auth",process.env.AUTH_SERVICE_URL||"http://localhost:3002"],
  ["/api/students",process.env.STUDENT_SERVICE_URL||"http://localhost:3001"],
  ["/api/courses",process.env.COURSE_SERVICE_URL||"http://localhost:3003"],
  ["/api/enrollments",process.env.ENROLLMENT_SERVICE_URL||"http://localhost:3004"],
  ["/api/notifications",process.env.NOTIFICATION_SERVICE_URL||"http://localhost:3005"],
  ["/api/progress",process.env.PROGRESS_SERVICE_URL||"http://localhost:3006"],
  ["/api/analytics",process.env.ANALYTICS_SERVICE_URL||"http://localhost:3007"]
];
app.get("/health/ready",async(req,res)=>{
  const results=await Promise.all(services.map(async([path,target])=>{
    try{
      const response=await fetch(`${target}/health/ready`,{signal:AbortSignal.timeout(2000)});
      return [path,response.ok];
    }catch{
      return [path,false];
    }
  }));
  const ready=results.every(([,isReady])=>isReady);
  res.status(ready?200:503).json({
    service:"api-gateway",
    status:ready?"ready":"not_ready",
    services:Object.fromEntries(results.map(([path,isReady])=>[path.slice(5),isReady?"ready":"not_ready"]))
  });
});
for(const [path,target] of services){
  app.use(path,createProxyMiddleware({
    target,changeOrigin:true,xfwd:true,
    pathRewrite:(p)=>p.replace(new RegExp("^"+path.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),""),
    on:{error:(err,req,res)=>{if(!res.headersSent)res.status(502).json({error:{code:"BAD_GATEWAY",message:"The requested service is unavailable"},requestId:req.headers["x-request-id"]});}}
  }));
}
if (process.env.SERVE_FRONTEND === "true") {
  const frontendDistDir = path.resolve(process.env.FRONTEND_DIST_DIR || "../../student-learning-platform-frontend/dist");
  const indexFile = path.join(frontendDistDir, "index.html");
  if (!existsSync(indexFile)) throw new Error(`Frontend build not found: ${indexFile}`);

  app.use(express.static(frontendDistDir, {
    dotfiles: "deny",
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  }));
  app.get("*", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/") || !req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexFile, error => error && next(error));
  });
}
app.use((req,res)=>res.status(404).json({error:{code:"NOT_FOUND",message:"Gateway route not found"},requestId:req.headers["x-request-id"]}));
export default app;
