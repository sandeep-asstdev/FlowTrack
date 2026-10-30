-- Phase 8 Authentication: Sign In, Sign Up, Google, Mobile OTP, Password Reset
-- Safe & Non-destructive Reversible Migration

-- 1. Alter users table with verification and session versioning columns
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 1;

-- 2. Create Auth Identities table
CREATE TABLE IF NOT EXISTS "auth_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_identities_provider_provider_subject_key" UNIQUE ("provider", "provider_subject"),
    CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- 3. Create OTP Challenges table
CREATE TABLE IF NOT EXISTS "otp_challenges" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGNUP',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "ip_address" TEXT,
    "resend_available_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_challenges_phone_purpose_idx" ON "otp_challenges"("phone", "purpose");
CREATE INDEX IF NOT EXISTS "otp_challenges_ip_address_idx" ON "otp_challenges"("ip_address");

-- 4. Create Phone Verification Proofs table
CREATE TABLE IF NOT EXISTS "phone_verification_proofs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "proof_hash" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verification_proofs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "phone_verification_proofs_proof_hash_key" UNIQUE ("proof_hash")
);

CREATE INDEX IF NOT EXISTS "phone_verification_proofs_phone_idx" ON "phone_verification_proofs"("phone");

-- 5. Create Password Reset Tokens table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- 6. Create Email Verification Tokens table
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_verification_tokens_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- 7. Create Pending Google Signups table
CREATE TABLE IF NOT EXISTS "pending_google_signups" (
    "id" TEXT NOT NULL,
    "google_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "token_hash" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_google_signups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pending_google_signups_google_sub_key" UNIQUE ("google_sub"),
    CONSTRAINT "pending_google_signups_token_hash_key" UNIQUE ("token_hash")
);

CREATE INDEX IF NOT EXISTS "pending_google_signups_email_idx" ON "pending_google_signups"("email");

