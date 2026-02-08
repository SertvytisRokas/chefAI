import { redirect } from 'next/navigation';
import { supabaseServer } from '../../lib/supabase/server';
import FridgeClient from './FridgeClient';

/**
 * Server component for the fridge page. It loads the current user's
 * fridge items and measurement types from Supabase and passes them
 * down to a client component for interactive editing. Unauthenticated
 * users are redirected to the login page.
 */
export default async function FridgePage() {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirect=/fridge');
  }
  // Fetch fridge items for the current user. Include measurement type name via foreign key.
  const { data: items } = await supabase
    .from('fridge_items')
    .select('id,name,quantity,measurement_type_id,measurement_types(name),expiration_date')
    .eq('user_id', user.id)
    .order('id', { ascending: true });
  // Fetch measurement types for the select input
  const { data: measurementTypes } = await supabase
    .from('measurement_types')
    .select('id,name')
    .order('id', { ascending: true });
  return (
    <FridgeClient
      initialItems={items ?? []}
      measurementTypes={measurementTypes ?? []}
    />
  );
}