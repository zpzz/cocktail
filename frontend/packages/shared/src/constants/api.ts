export const API_PREFIX = '/api/cocktail';

export const API_PATHS = {
  authRegister: `${API_PREFIX}/auth/register`,
  authLogin: `${API_PREFIX}/auth/login`,
  authWechat: `${API_PREFIX}/auth/wechat`,
  authRefresh: `${API_PREFIX}/auth/refresh`,
  authLogout: `${API_PREFIX}/auth/logout`,
  authProfile: `${API_PREFIX}/auth/profile`,
  authAvatar: `${API_PREFIX}/auth/avatar`,
  chat: `${API_PREFIX}/chat`,
  chatResume: `${API_PREFIX}/chat/resume`,
  cabinet: `${API_PREFIX}/cabinet`,
  cabinetRecognize: `${API_PREFIX}/cabinet/recognize`,
  cabinetMenu: `${API_PREFIX}/cabinet/menu`,
  menus: `${API_PREFIX}/menus`,
  customs: `${API_PREFIX}/customs`,
  workbenchGlasses: `${API_PREFIX}/workbench/glasses`,
  workbenchOptions: `${API_PREFIX}/workbench/options`,
  workbenchSessions: `${API_PREFIX}/workbench/sessions`,
  ingredientsCategories: `${API_PREFIX}/ingredients/categories`,
  ingredientsSearch: `${API_PREFIX}/ingredients/search`,
  recipesRandom: `${API_PREFIX}/recipes/random`,
} as const;
