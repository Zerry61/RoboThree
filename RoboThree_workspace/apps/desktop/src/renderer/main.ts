import { createApp } from "vue";

import App from "./app/App.vue";
import { createRoboThreeRouter } from "./app/router.js";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/typography.css";
import "./styles/utilities.css";
import "./styles/states.css";
import "./styles.css";

createApp(App)
  .use(createRoboThreeRouter())
  .mount("#app");
