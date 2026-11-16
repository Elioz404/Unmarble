/** The app's root element; every entry page declares `<div id="root">`. */
export const mountRoot = (): HTMLElement => {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  return root;
};
