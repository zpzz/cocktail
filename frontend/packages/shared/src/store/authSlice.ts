import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  nickname: string | null;
};

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  nickname: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        nickname: string;
      }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.nickname = action.payload.nickname;
    },
    signedOut() {
      return initialState;
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
