import assert from "node:assert/strict";
import test from "node:test";
import { consumeReceiptQueue, receiptOutcome, readAgentHealth } from "../src/features/receipt-printing/model/queue-worker.ts";
const job={printerIp:"192.168.0.86",printerPort:9100,transport:"RAW_TCP",items:[{id:"item",name:"dish",quantity:1,unitPrice:10}]};
const task={id:"task",orderId:"order",orderNumber:1,stationId:"station",claimToken:"lease",dispatchId:"dispatch",plan:{orderId:"order",orderNumber:1,documentType:"ORDER",mainJob:job,jobs:[job],unassignedItems:[],summary:{total:10,subtotal:10,discount:0,deliveryFee:0}}};
const success={agentId:"station",dispatchId:"dispatch",orderId:"order",printed:[job,job],failed:[]};

test("only complete, matching agent results acknowledge delivery",()=>{
 assert.equal(receiptOutcome(task,200,success).outcome,"DELIVERED");
 for (const result of [{}, {...success,dispatchId:"other"},{...success,agentId:"replacement"}]) assert.equal(receiptOutcome(task,200,result).outcome,"RETRY");
 for (const result of [{...success,printed:[job]},{...success,failed:[job]},{...success,uncertain:true}]) assert.equal(receiptOutcome(task,200,result).outcome,"UNCERTAIN");
 assert.equal(receiptOutcome(task,502,{...success,retryable:true,printed:[],failed:[job]}).outcome,"RETRY");
});
test("missing response retries the same frozen dispatch and resumes after a reload",async t=>{
 const payloads=[],outcomes=[];
 const request=async(path,options)=>{
   if(path.endsWith("/claim")) return {task};
   if(path.endsWith("/outcome")) outcomes.push(JSON.parse(options.body));
   return {ok:true};
 };
 t.mock.method(globalThis,"fetch",async(_url,options)=>{
   payloads.push(JSON.parse(options.body));
   if(payloads.length===1) throw new TypeError("lost response after print");
   return Response.json(success);
 });
 await consumeReceiptQueue(request,"http://127.0.0.1:17873","station");
 // No client memory is required for the retry (as on a newly opened page).
 await consumeReceiptQueue(request,"http://127.0.0.1:17873","station");
 assert.deepEqual(payloads[0],payloads[1]);assert.equal(payloads[0].dispatchId,"dispatch");assert.equal(payloads[0].agentId,"station");
 assert.deepEqual(outcomes.map(o=>o.outcome),["RETRY","DELIVERED"]);
});
test("lost server ACK leaves recovery to lease expiry without inventing success",async t=>{
 t.mock.method(globalThis,"fetch",async()=>Response.json(success));
 await assert.rejects(consumeReceiptQueue(async path=>{
  if(path.endsWith("/claim"))return {task};
  throw new Error("server disconnected before ACK");
 },"http://127.0.0.1:17873","station"),/disconnected/);
});
test("uncertain copies require operator review while no-printer plans fail visibly",async t=>{
 const outcomes=[];let current=task;
 const request=async(path,options)=>{if(path.endsWith("/claim"))return {task:current};outcomes.push(JSON.parse(options.body));};
 const fetch=t.mock.method(globalThis,"fetch",async()=>Response.json({...success,uncertain:true},{status:409}));
 await consumeReceiptQueue(request,"http://127.0.0.1:17873","station");
 current={...task,plan:{...task.plan,mainJob:null,jobs:[]}};
 await consumeReceiptQueue(request,"http://127.0.0.1:17873","station");
 assert.deepEqual(outcomes.map(o=>o.outcome),["UNCERTAIN","FAILED"]);assert.equal(fetch.mock.callCount(),1);
});
test("an empty queue never sends paper and an old agent cannot claim work",async t=>{
 const fetch=t.mock.method(globalThis,"fetch",async()=>Response.json({capabilities:["receipt-layout-v2"]}));
 assert.equal(await consumeReceiptQueue(async()=>({task:null}),"http://127.0.0.1:17873","station"),null);
 assert.equal(fetch.mock.callCount(),0);
 await assert.rejects(readAgentHealth("http://127.0.0.1:17873",AbortSignal.timeout(1000)),/Обновите/);
});
