import { useNavigate } from "react-router-dom";

/**
 * Sign-up with email page (CSR).
 * EmailSignUpForm component will be wired in Phase 4.
 */
export default function SignUpEmailPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* EmailSignUpForm component will be mounted here in Phase 4 */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Sign up with email</h1>
      </div>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground"
        onClick={() => navigate("/sign-up")}
      >
        ← Back
      </button>
    </div>
  );
}
