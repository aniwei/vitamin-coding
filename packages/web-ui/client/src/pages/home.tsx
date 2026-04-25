import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main style={{ padding: 24 }}>
      <h1>{t("app.title")}</h1>
      <nav style={{ display: "flex", gap: 12 }}>
        <Link to="/">{t("nav.home")}</Link>
        <Link to="/sign-in">{t("nav.signin")}</Link>
        <Link to="/health">Health</Link>
      </nav>
    </main>
  );
}
