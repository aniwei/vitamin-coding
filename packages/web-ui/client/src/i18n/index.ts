import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en-US/common.json";
import zhCommon from "./locales/zh-CN/common.json";
import enChat from "./locales/en-US/chat.json";
import zhChat from "./locales/zh-CN/chat.json";
import enMcp from "./locales/en-US/mcp.json";
import zhMcp from "./locales/zh-CN/mcp.json";
import enWorkflow from "./locales/en-US/workflow.json";
import zhWorkflow from "./locales/zh-CN/workflow.json";
import enAuth from "./locales/en-US/auth.json";
import zhAuth from "./locales/zh-CN/auth.json";
import enSettings from "./locales/en-US/settings.json";
import zhSettings from "./locales/zh-CN/settings.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": {
        common: zhCommon,
        chat: zhChat,
        mcp: zhMcp,
        workflow: zhWorkflow,
        auth: zhAuth,
        settings: zhSettings,
      },
      "en-US": {
        common: enCommon,
        chat: enChat,
        mcp: enMcp,
        workflow: enWorkflow,
        auth: enAuth,
        settings: enSettings,
      },
    },
    fallbackLng: "en-US",
    lng: "zh-CN",
    defaultNS: "common",
    ns: ["common", "chat", "mcp", "workflow", "auth", "settings"],
    interpolation: {
      escapeValue: false,
    },
  });

export { i18n };
