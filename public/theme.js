document.documentElement.setAttribute(
	"color-scheme",
	window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
);
