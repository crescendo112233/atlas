import OSS from "ali-oss";
import Credential, { Config } from "@alicloud/credentials";

const CredentialClient = Credential.default ?? Credential;

const roleName = process.env.ALIBABA_CLOUD_ECS_ROLE_NAME;
const region = process.env.OSS_REGION;
const bucket = process.env.OSS_BUCKET;

if (!roleName || !region || !bucket) {
  throw new Error("OSS_REGION, OSS_BUCKET, and ALIBABA_CLOUD_ECS_ROLE_NAME are required");
}

const provider = new CredentialClient(new Config({
  type: "ecs_ram_role",
  roleName,
  disableIMDSv1: true,
}));
const credential = await provider.getCredential();
const client = new OSS({
  region,
  bucket,
  accessKeyId: credential.accessKeyId,
  accessKeySecret: credential.accessKeySecret,
  stsToken: credential.securityToken,
  secure: true,
  authorizationV4: true,
});

const result = await client.list({ "max-keys": 1 });
console.log(`OSS access OK (${result.objects?.length ?? 0} object returned)`);

const objectKey = `healthchecks/atlas-${Date.now()}.txt`;
const expected = "TOOP & PP'S ATLAS OSS health check";
let uploaded = false;

try {
  await client.put(objectKey, Buffer.from(expected, "utf8"));
  uploaded = true;
  console.log("OSS upload OK");

  const downloaded = await client.get(objectKey);
  if (downloaded.content.toString("utf8") !== expected) {
    throw new Error("Downloaded OSS health-check content did not match");
  }
  console.log("OSS download OK");
} finally {
  if (uploaded) {
    await client.delete(objectKey);
    console.log("OSS delete OK");
  }
}
