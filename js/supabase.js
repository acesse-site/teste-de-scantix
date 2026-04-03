// Supabase client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: get current user
async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}
