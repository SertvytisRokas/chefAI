/**
 * Home page. Provides a brief introduction to the Meal Genius app and
 * directs users to login or start managing their fridge. This page
 * renders on the server but contains no dynamic data.
 */
export default function HomePage() {
  return (
    <div className="mt-8 space-y-4">
      <h1 className="text-3xl font-bold">Welcome to Meal Genius</h1>
      <p>
        Reduce food waste and cook delicious meals from the ingredients
        you already have. Start by adding items to your fridge, then
        let our genius generate recipes tailored to your diet, likes
        and dislikes.
      </p>
    </div>
  );
}