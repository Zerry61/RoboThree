import { createApp } from "vue";

import App from "./app/App.vue";
import {
  createDemoAuthSessionStore,
  demoAuthSessionKey,
} from "./app/demo-auth-session.js";
import { createRoboThreeRouter } from "./app/router.js";
import { configuredRuntimeMode, runtimeModeKey } from "./app/runtime-mode.js";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/typography.css";
import "./styles/utilities.css";
import "./styles/states.css";
import "./styles.css";

const runtimeMode = configuredRuntimeMode();
const demoAuthSession = createDemoAuthSessionStore();

createApp(App)
  .provide(runtimeModeKey, runtimeMode)
  .provide(demoAuthSessionKey, demoAuthSession)
  .use(createRoboThreeRouter({ runtimeMode, demoAuthSession }))
  .mount("#app");
