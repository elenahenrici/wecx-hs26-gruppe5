import {ConnectorProjector} from "../../../framework/client/js/projector/connectorProjector.js";
import {defaultProjectors}  from "../../../framework/client/js/projector/defaultProjectors.js";
import {dom}                from "../../../framework/client/js/util/dom.js";
import {ONE_TO_MANY}        from "../../../framework/client/js/types.js";
import {AVATAR_URL}             from "./Constants.js";

export { appProjectors }

const connectorProjector = (workbenchController) => {

    const SpecialProjector = (workbenchController) => {
        const projectConnection = (rel_meta, entityName, entity) => {
            // if (rel_meta.relationId !== ARTIST_ARTWORK ) {
                return ConnectorProjector(workbenchController).projectConnection(rel_meta, entityName, entity);
            // }
            const isOneToMany = rel_meta.cardinality === ONE_TO_MANY;
            const isOneSide = entityName === rel_meta.oneTable;

            const ourKey   = isOneSide ? rel_meta.oneFK : rel_meta.manyFK; // it needs to work both ways
            const otherKey = isOneSide ? rel_meta.manyFK : rel_meta.oneFK;

            const otherTable = isOneSide ? rel_meta.manyTable : rel_meta.oneTable;

            const label = isOneSide ? rel_meta.oneLabel : rel_meta.manyLabel;

            const [labelEl, divEl] = dom(`
                <div>${label}</div>
                <div>
                    <ul>
                    </ul>
                    <button type="button" 
                        commandfor="${rel_meta.relationId}_selection_dialog"   
                        command="show-modal">
                        select
                    </button>
                    <dialog id="${rel_meta.relationId}_selection_dialog">        
                      <div>            
                        <select ${ (isOneSide || !isOneToMany) ? "multiple" : ""} size=20>
                        </select>                    
                      <button class="submit" type="button" commandfor="${rel_meta.relationId}_selection_dialog" command="close">
                        Submit
                       </button>                
                      <button type="button" commandfor="${rel_meta.relationId}_selection_dialog" command="close">
                        Cancel
                       </button>
                       </div>
                    </dialog>
                </div>
            `);

            const submitButton = divEl.querySelector("button.submit");
            const dialogSelEl  = divEl.querySelector("dialog select");
            const ulEl         = divEl.querySelector("ul");

            // --- data binding ---

            // before the dialog opens, fill the options with all available artworks
            workbenchController
                .getAllEntities(otherTable)
                .then(manyEntities => {
                    const optionsHtml = manyEntities.map( manyEntity =>
                        `<option 
                            data-text="${manyEntity.displayedAs}" 
                            value="${manyEntity.id}"
                            >
                            <span class="icon"><img heigth=100 width=100 src="${manyEntity.pictureUrl ?? AVATAR_URL}"></span>
                            <span class="option-label">${manyEntity.displayedAs}</span>                            
                            </option>
                            `)
                         .join("");
                    dialogSelEl.innerHTML = optionsHtml;
                });

            // navigate from the closed view to the respective entity
            const bindUlLis = () => {
                ulEl.querySelectorAll("li").forEach(li =>
                    li.onclick = _evt => {
                        workbenchController.selectId(otherTable, li.getAttribute("data-id"))
                    }
                )
            };

            // fill the list of artworks in the closed view with info from the relation service
            // and update the selected attribute of the select options
            dialogSelEl.querySelectorAll("option").forEach(option => option.removeAttribute("selected"));
            workbenchController
                .getRelationService(rel_meta.relationId)
                .getAll()
                .then ( relations => {
                    const filtered = relations.filter( rel => rel[ourKey] === entity.id);
                    const manyIds = filtered.map( rel => rel[otherKey] );
                    ulEl.innerHTML = "";
                    manyIds.forEach( manyId => {
                        workbenchController
                            .findEntity(otherTable, manyId)
                            .then ( manyEntity => {
                                // update the result view
                                ulEl.innerHTML += `<li data-id="${manyEntity.id}">${manyEntity.displayedAs}</li>`;
                                bindUlLis();
                                // update the select options to mark the selected ones
                                dialogSelEl.querySelector(`[value="${manyId}"]`)?.setAttribute("selected","selected");
                            });
                    })
                });

            // --- view binding

            // when the dialog closes...
            // update the list of artworks in the closed view with info from the current user selection
            submitButton.onclick = _evt => {
                const selectedIds = [...dialogSelEl.selectedOptions].map(option => option.value);
                ulEl.innerHTML = [...dialogSelEl.selectedOptions].map(option => `<li data-id="${option.value}">${option.getAttribute("data-text")}</li>`).join("");
                bindUlLis();

                const relationService = workbenchController.getRelationService(rel_meta.relationId);
                relationService
                    .getAll()
                    .then ( relations => { // Note: this is complex and might better go into a controller
                        // first remove all relations that might get in the way, then add the selected ones
                        const removePromises =
                            relations
                            .filter(rel => { // remove all artw for this artist
                                if (rel[ourKey]===entity.id) return true;
                                if ( ! isOneToMany) return false;
                                // we are in a one-to-many relation, therefore:
                                // remove the artwork if we will set it but some else might be in a relation
                                if ( selectedIds.indexOf( rel[otherKey]) > -1 ) return true;
                                return false;
                            })
                            .map( relation => {
                                return relationService.removeById(relation.id);
                        });
                        // make sure all removals are finished before we add the selection
                        Promise.all(removePromises)
                           .then( _ => {
                               selectedIds.forEach( manyId => {
                                   relationService.add({[ourKey]:entity.id, [otherKey]:manyId});
                               })
                           })
                    });
            };

            return [labelEl, divEl];
        };
        return { projectConnection }
    };

    console.info("specialized connector projector in use");
    return SpecialProjector(workbenchController);
};


/** @type { ProjectorProviderType } */
const appProjectors = {
    ...defaultProjectors, // default - we only want to specialize the connectors
    connectorProjector,
};

