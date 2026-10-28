// Most tests check what the catalog does, not how it arrives, so it is loaded before them in every
// language. `catalogLoading.test.ts` starts from a clean state to check the loading itself.
import { supportedLocales } from "../i18n";
import { loadCatalog } from "../hooks/useCatalog";

await Promise.all(supportedLocales.map(({ code }) => loadCatalog(code)));
