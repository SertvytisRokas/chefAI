export default function Home() {
  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold mb-4">Welcome to Meal Genius</h1>
      <p className="mb-4">
        Start by adding items to your fridge so we can help you turn them
        into delicious meals.
      </p>
      <a
        href="/fridge"
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        Go to Fridge
      </a>
    </div>
  );
}