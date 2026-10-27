import { Router } from "express";
import Notification from "./model.js";
import { asyncHandler, authenticate, parseObjectId } from "@slp/common";
const router=Router();
router.get("/",authenticate,asyncHandler(async(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
  const [notifications,total,unread]=await Promise.all([
    Notification.find({userId:req.user.sub}).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),
    Notification.countDocuments({userId:req.user.sub}),
    Notification.countDocuments({userId:req.user.sub,readAt:null})
  ]);
  res.json({notifications,unread,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));
router.patch("/:id/read",authenticate,asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid notification ID"},requestId:req.requestId});
  const notification=await Notification.findOneAndUpdate({_id:req.params.id,userId:req.user.sub},{readAt:new Date()},{new:true});
  if(!notification) return res.status(404).json({error:{code:"NOT_FOUND",message:"Notification not found"},requestId:req.requestId});
  res.json({notification});
}));
export default router;
