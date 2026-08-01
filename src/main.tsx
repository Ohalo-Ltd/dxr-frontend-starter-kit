import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { loadRuntimeConfig } from "./config/runtimeConfig";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/app.css";
import { SystemThemeProvider } from "./theme/SystemThemeProvider";

function renderConfigurationFailure(): void {
	const root = document.getElementById("root");
	if (root === null) {
		return;
	}

	root.replaceChildren();
	const main = document.createElement("main");
	main.className = "configuration-error";
	main.setAttribute("role", "alert");
	const heading = document.createElement("h1");
	heading.textContent = "Application unavailable";
	const message = document.createElement("p");
	message.textContent = "The application configuration is missing or invalid.";
	main.append(heading, message);
	root.append(main);
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
	throw new Error("Root element is unavailable");
}

loadRuntimeConfig()
	.then((config) => {
		document.title = config.appName;
		createRoot(rootElement).render(
			<StrictMode>
				<SystemThemeProvider>
					<App config={config} />
				</SystemThemeProvider>
			</StrictMode>,
		);
	})
	.catch(() => {
		renderConfigurationFailure();
	});
