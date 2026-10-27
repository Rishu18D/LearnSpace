import amqp from "amqplib";
import Notification from "./model.js";

export async function startConsumer() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672");
  const channel = await conn.createChannel();
  await channel.assertExchange("slp.events","topic",{durable:true});
  const q = await channel.assertQueue("notifications.enrollment",{durable:true});
  await channel.bindQueue(q.queue,"slp.events","EnrollmentCreated");
  channel.prefetch(10);
  channel.consume(q.queue, async msg => {
    if(!msg) return;
    try {
      const event=JSON.parse(msg.content.toString());
      if(event.eventType==="EnrollmentCreated") {
        await Notification.updateOne({eventId:event.eventId},{
          $setOnInsert:{eventId:event.eventId,userId:event.data.studentId,type:"enrollment",title:"Enrollment successful",message:"You have enrolled in a course.",data:{courseId:event.data.courseId,enrollmentId:event.data.enrollmentId}}
        },{upsert:true});
      }
      channel.ack(msg);
    } catch(err) {
      console.error("Notification event failed:",err.message);
      channel.nack(msg,false,false);
    }
  });
  console.log("Notification consumer listening for enrollment events");
}
