import {dom}                 from "../util/dom.js";
import {WorkbenchController} from "../controller/workbenchController.js";

export { SiteProjector }

const SiteProjector = siteController => {

    const workbenchController = WorkbenchController(siteController);
    const workbenchProjector  = siteController.getProjectors().workbenchProjector(workbenchController);

    const projectLogin = () => {
        const [login] = dom(`            
            <div class="login">
                <label for="login">user</label>
                <select id="login">
                    <option value="0" selected>Freddy</option>
                    <option value="1">Udo</option>
                    <option value="2">Alex</option>
                </select>
            </div>
        `);
        /** @type { HTMLSelectElement } */
        const userSelect = login.querySelector("#login");
        siteController.onCurrentUserIdChanged( id => userSelect.value = id);               // data binding
        userSelect.onchange = _evt => siteController.setCurrentUserId(userSelect.value);   // view binding
        return [login];
    };

    // created once and stored for later reference
    const [workbenchSection] = dom(`            
        <section class="workbench">
        </section>
    `);

    const replaceWorkbenchContent = (newHtmlCollection) => {
        workbenchSection.innerHTML = "";
        workbenchSection.append(...newHtmlCollection);
    };

    const projectExplorers = () => {
        const [explorerSection] = dom(`
        <div class="boxes">
        </div>
        `);

        explorerSection.innerHTML = "";
        siteController.getMeta().allEntityNames.forEach(entityName => {
            const explorerProjector = siteController.getProjectors().explorerProjector(entityName, siteController);
            explorerSection.append(...explorerProjector.projectExplorer());
        });

        return [explorerSection];
    };


    const projectBodyContent = () => {
        const bodyContent = dom(`
        <header>
            <h1>FHNW-WoWeb <span class="fancy">Lecturer Edition</span></h1>
        </header>
        <main>        
        </main>        
        <footer>Version: Workshop Web Experience HS 26</footer>        
        `);
        const [header, main, _footer] = bodyContent;
        header.append(...projectLogin());
        main.append(
            ...projectExplorers(),
            workbenchSection
        );

        // binding
        // general app start-stop bindings - nothing to do atm

        return bodyContent;
    };

    // selection data binding
    siteController.onSelection( selection => {
        replaceWorkbenchContent(workbenchProjector.projectWorkbench(selection))
    });

    return { projectBodyContent, replaceWorkbenchContent }
};
