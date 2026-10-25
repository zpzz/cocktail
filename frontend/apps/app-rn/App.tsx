import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardProvider,
} from 'react-native-keyboard-controller';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { store } from './src/store';

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    // 不让系统 resize/藏 Tab；输入框用 KeyboardStickyView 按 Tab 高度跟键盘上推。
    KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
    return () => KeyboardController.setDefaultMode();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <Provider store={store}>
          <SafeAreaProvider>
            <RootNavigator />
            <StatusBar style="light" />
          </SafeAreaProvider>
        </Provider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
