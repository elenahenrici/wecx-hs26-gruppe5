/**
 * Shared selection model for all sketches. Behaves like <select multiple>:
 *  - holds a set of selected option ids
 *  - keeps a real, hidden <select multiple> in sync, so the value works in forms
 *  - dispatches a "change" event on that <select> whenever the selection changes
 *
 * Each sketch only decides how the options LOOK and how the user selects them.
 * The behaviour stays the same for all sketches.
 *
 * Usage:
 *   const model = MultiSelect({ name: "artworks", options: artworks });
 *   model.onChange(value => render());   // value = array of selected ids
 *   button.onclick = () => model.toggle(option.id);
 */
export { MultiSelect };

/**
 * @param {{ name: string, options: Array<{id:string, label:string}>, max?: number }} config
 */
const MultiSelect = ({ name, options, max = Infinity }) => {
    const selected  = new Set();
    const listeners = [];

    const element = document.createElement("select");
    element.multiple = true;
    element.name     = name;
    element.hidden   = true;
    options.forEach(o => element.append(new Option(o.label, o.id)));

    const isSelected = id => selected.has(id);
    const getValue   = () => options.filter(o => selected.has(o.id)).map(o => o.id); // keeps option order
    const getSelectedOptions = () => options.filter(o => selected.has(o.id));

    const notify = () => {
        [...element.options].forEach(opt => opt.selected = selected.has(opt.value));
        const value = getValue();
        listeners.forEach(callback => callback(value));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const select   = id => { if (selected.has(id) || selected.size >= max) return; selected.add(id); notify(); };
    const deselect = id => { if (!selected.delete(id)) return; notify(); };
    const toggle   = id => isSelected(id) ? deselect(id) : select(id);
    const clear    = () => { if (selected.size === 0) return; selected.clear(); notify(); };

    /** registers a callback and calls it once immediately with the current value */
    const onChange = callback => { listeners.push(callback); callback(getValue()); };

    return { element, options, select, deselect, toggle, clear, isSelected, getValue, getSelectedOptions, onChange };
};
