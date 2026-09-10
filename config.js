// Rocket configuration.
// Leave both values empty to run the local demo (sample data, role switcher, nothing leaves the browser).
// Fill them in to go live. Both values are safe to publish: the anon key only allows what the
// database's row-level security policies allow. NEVER put the service_role key here.
window.ROCKET_CONFIG = {
  supabaseUrl: 'https://ptcsxotsucwaxqfrdlkd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y3N4b3RzdWN3YXhxZnJkbGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjQ2NTcsImV4cCI6MjEwNDY0MDY1N30.FpAkmVz3iNeJPbt-p8B2-eCzfAdCN5wzhBfIsxiGy_o',  // public anon key
  // Web Push public (VAPID) key — made by `node scripts/make-push-keys.mjs`. The private half lives only in Supabase secrets.
  vapidPublicKey: 'BPB6oDq6PEwZUk4ZxU1StrOwuHmyQdTlO3HeYrCB-qo_bFxqzTFGn36mBIldNdeds79Y8rjHve9CpfxAmx22-CU',
};
