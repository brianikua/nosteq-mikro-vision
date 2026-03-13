// Application version metadata
export const APP_VERSION = {
  major: 2,
  minor: 4,
  patch: 0,
  build: 145,
  environment: import.meta.env.MODE === 'production' ? 'Production' : 'Staging',
  deployedAt: new Date().toISOString(),
};

export const getVersionString = () =>
  `v${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.patch}`;

export const getFullVersionString = () =>
  `${getVersionString()} (Build ${APP_VERSION.build})`;
