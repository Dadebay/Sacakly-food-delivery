-- OTP challenges are short-lived security data. They now live in Redis with
-- native TTL and atomic one-time consumption, so the persistent table is no
-- longer used. Deploying this migration invalidates any outstanding old codes.
DROP TABLE "PhoneOtp";
