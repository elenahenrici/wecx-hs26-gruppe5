/**
 * Small panel that shows what the selection model contains.
 * Useful for testing and for the presentation: it proves that the custom UI
 * and the native <select multiple> always stay in sync.
 */
export { DebugPanel };

const DebugPanel = (model, title = "Selection") => {
    const panel = document.createElement("details");
    panel.className = "debug";
    panel.open = true;
    panel.innerHTML = `<summary>Debug: ${title}</summary><p>value: <code></code></p><p>native select (normally hidden):</p>`;
    const code = panel.querySelector("code");

    const nativeCopy = model.element.cloneNode(true);
    nativeCopy.hidden = false;
    nativeCopy.disabled = true;
    panel.append(nativeCopy);

    model.onChange(value => {
        code.textContent = JSON.stringify(value);
        [...nativeCopy.options].forEach(opt => opt.selected = value.includes(opt.value));
    });
    return panel;
};
