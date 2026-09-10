// Creates the keys Rocket's phone notifications need. Run once:  node scripts/make-push-keys.mjs
// Writes two files that are never committed (see .gitignore):
//   .env.push              → secrets for `supabase secrets set --env-file .env.push`
//   push-cron.local.sql    → the daily 9 AM reminder job, to paste into the Supabase SQL editor
// and prints the PUBLIC key, which goes into config.js (safe to publish).
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

if (existsSync('.env.push')) { console.error('.env.push already exists — delete it first if you really want new keys (existing devices would need to re-enable notifications).'); process.exit(1); }
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' });
const publicKeyB64 = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]));
const cronSecret = b64url(randomBytes(32));

writeFileSync('.env.push', `VAPID_PUBLIC_KEY=${publicKeyB64}\nVAPID_PRIVATE_KEY=${priv.d}\nCRON_SECRET=${cronSecret}\n`, { mode: 0o600 });
writeFileSync('push-cron.local.sql', `-- Rocket: daily reminder push at 9:00 AM Dubai time (05:00 UTC). Paste into the Supabase SQL editor once.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('rocket-daily-reminders') where exists (select 1 from cron.job where jobname = 'rocket-daily-reminders');
select cron.schedule('rocket-daily-reminders', '0 5 * * *', $job$
  select net.http_post(
    url := 'https://ptcsxotsucwaxqfrdlkd.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '${cronSecret}'),
    body := '{"action":"digest"}'::jsonb)
$job$);
`, { mode: 0o600 });
console.log('Wrote .env.push and push-cron.local.sql (both private).');
console.log('Public key for config.js:');
console.log(publicKeyB64);
