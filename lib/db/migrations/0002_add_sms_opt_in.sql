-- Add SMS opt-in consent flag to buyer_leads.
-- Required for TCPA compliance: Twilio SMS is only sent to leads where sms_opt_in = true.
ALTER TABLE "buyer_leads" ADD COLUMN IF NOT EXISTS "sms_opt_in" boolean NOT NULL DEFAULT false;
