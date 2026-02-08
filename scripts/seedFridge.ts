import { createClient } from '@supabase/supabase-js';

/**
 * Seed fridge items for a user by email. This script should be run
 * with Node.js and requires the Supabase service role key. It looks
 * up the user by email, fetches measurement type IDs from the
 * database, and inserts a few sample fridge items. To run:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=your_key NEXT_PUBLIC_SUPABASE_URL=your_url node scripts/seedFridge.js user@example.com
 */

async function seed(email: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing');
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'seed-fridge-script' } }
  });
  // Look up user by email
  const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email);
  if (userError) throw userError;
  const user = (userData as any)?.user || userData;
  if (!user || !user.id) {
    console.log(`User not found for email ${email}`);
    return;
  }
  const userId = user.id as string;
  // Fetch measurement type IDs
  const { data: measurements } = await supabase.from('measurement_types').select('id,name');
  const getId = (name: string) => {
    return measurements?.find((m: any) => m.name.toLowerCase() === name.toLowerCase())?.id;
  };
  // Define sample items. Adjust quantities and units as desired.
  const sampleItems = [
    { name: 'eggs', quantity: 12, unit: 'units', expires: null },
    { name: 'milk', quantity: 1, unit: 'liters', expires: null },
    { name: 'potatoes', quantity: 2, unit: 'kilograms', expires: null },
    { name: 'butter', quantity: 200, unit: 'grams', expires: null }
  ];
  const inserts = sampleItems.map((item) => ({
    user_id: userId,
    name: item.name,
    quantity: item.quantity,
    measurement_type_id: getId(item.unit) || getId('pieces'),
    expiration_date: item.expires
  }));
  const { error: insertError } = await supabase.from('fridge_items').insert(inserts);
  if (insertError) {
    throw insertError;
  }
  console.log(`Inserted ${inserts.length} items into fridge for ${email}`);
}

const email = process.argv[2];
if (!email) {
  console.log('Usage: node seedFridge.ts <user-email>');
  process.exit(1);
}
seed(email).catch((err) => {
  console.error(err);
  process.exit(1);
});