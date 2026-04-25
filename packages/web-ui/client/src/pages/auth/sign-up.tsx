import { useNavigate } from "react-router-dom";

/**
 * Sign-up page (CSR).
 * SignUp component will be wired in Phase 4.
 */
export default function SignUpPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* SignUp component will be mounted here in Phase 4 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Sign up</h1>
      </div>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground"
        onClick={() => navigate("/sign-in")}
      >
        Already have an account? Sign in
      </button>
    </div>
  );
}
