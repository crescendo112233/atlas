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
