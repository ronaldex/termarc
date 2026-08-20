import { createApp } from "vue";
import App from "./App.vue";
import "@xterm/xterm/css/xterm.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/forms.css";

// Production uses only Termarc's contextual actions. Keep the WebView menu in
// development so `tauri dev` still exposes Reload and Inspect Element.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });
}

createApp(App).mount("#app");
