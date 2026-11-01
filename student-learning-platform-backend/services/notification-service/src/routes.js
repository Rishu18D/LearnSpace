import { Router } from "express";
import { z } from "zod";
import Notification from "./model.js";
import { asyncHandler, authenticate, parseObjectId } from "@slp/common";
const router=Router();
router.get("/",authenticate,asyncHandler(async(req,res)=>{
  const {page,limit,status}=z.object({
    page:z.coerce.number().int().min(1).default(1),
    limit:z.coerce.number().int().min(1).max(100).default(20),
    status:z.enum(["unread","read"]).optional()
  }).parse(req.query);
  const filter={userId:req.user.sub};
  if(status) {
    filter.readAt=status==="unread"?null:{$ne:null};
  }
  const [notifications,total,unread,all,read]=await Promise.all([
    Notification.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({userId:req.user.sub,readAt:null}),
    Notification.countDocuments({userId:req.user.sub}),
    Notification.countDocuments({userId:req.user.sub,readAt:{$ne:null}})
  ]);
  res.json({notifications,unread,counts:{all,unread,read},pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));
router.patch("/read-all",authenticate,asyncHandler(async(req,res)=>{
  const result=await Notification.updateMany({userId:req.user.sub,readAt:null},{$set:{readAt:new Date()}});
  res.json({updated:result.modifiedCount});
}));
router.patch("/:id/read",authenticate,asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid notification ID"},requestId:req.requestId});
  const notification=await Notification.findOneAndUpdate(
    {_id:req.params.id,userId:req.user.sub,readAt:null},
    {$set:{readAt:new Date()}},
    {new:true}
  ) || await Notification.findOne({_id:req.params.id,userId:req.user.sub});
  if(!notification) return res.status(404).json({error:{code:"NOT_FOUND",message:"Notification not found"},requestId:req.requestId});
  res.json({notification});
}));
export default router;
