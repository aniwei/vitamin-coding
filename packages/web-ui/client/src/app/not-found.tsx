import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>404</h1>
      <p>Page not found.</p>
      <Link to="/">Go Home</Link>
    </main>
  );
}



