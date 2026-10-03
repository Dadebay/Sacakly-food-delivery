import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT || "http://127.0.0.1:9000";
const bucket = process.env.S3_BUCKET || "alowalow-media";
const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "alofood",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "alofood-local-secret",
  },
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/minio/health/live`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The local container may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    throw new Error(`Local S3 endpoint did not become ready: ${endpoint}`);
  }

  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Local S3 bucket ready: ${bucket}`);
} catch (error) {
  if (error?.name === "BucketAlreadyOwnedByYou" || error?.name === "BucketAlreadyExists") {
    console.log(`Local S3 bucket already exists: ${bucket}`);
  } else {
    throw error;
  }
} finally {
  client.destroy();
}
