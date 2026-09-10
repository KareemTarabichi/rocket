// Rocket configuration.
// Leave both values empty to run the local demo (sample data, role switcher, nothing leaves the browser).
// Fill them in to go live. Both values are safe to publish: the anon key only allows what the
// database's row-level security policies allow. NEVER put the service_role key here.
window.ROCKET_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijklmnop.supabase.co'
  supabaseAnonKey: '',  // Supabase dashboard → Project Settings → API → anon / public key
};
