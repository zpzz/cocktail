import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from './authSlice';

export function createAppStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export { signedIn, signedOut } from './authSlice';
