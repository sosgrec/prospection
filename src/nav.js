// Navigation entre les vues, sans dépendances croisées entre modules :
// chaque vue enregistre ses fonctions au démarrage.
export const nav = {
  goTab: (name) => {},
  showOnMap: (addressId, opts) => {},
  openAddress: (addressId) => {},
  openAddressPage: (addressId) => {},
  openBuilding: (addressId) => {},
  openContact: (contactId, opts) => {},
  newContact: (opts) => {},
  openScenario: (scenarioId) => {},
  refreshCounter: () => {},
};
export function register(fns) {
  Object.assign(nav, fns);
}
