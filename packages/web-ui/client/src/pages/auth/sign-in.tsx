import { useNavigate } from "react-router-dom";

/**
 * Sign-in page (CSR).
 * SignIn component will be wired in Phase 4.
 * Auth config is fetched from /api/auth/* instead of server-side helpers.
 */
export default function SignInPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* SignIn component will be mounted here in Phase 4 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Sign in</h1>
      </div>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground"
        onClick={() => navigate("/")}
      >
        Back to home
      </button>
    </div>
  );
}
