import css from "./critical-theme.css?inline";

const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);
