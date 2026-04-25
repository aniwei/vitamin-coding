import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHealth } from "../lib/api/health";

export function HealthPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>(t("health.checking"));

  useEffect(() => {
    void getHealth().then((result) => {
      if (result.success) {
        setStatus(t("health.ok"));
        return;
      }

      setStatus(result.error.message);
    });
  }, [t]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Health</h1>
      <p>{status}</p>
    </main>
  );
}
