import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { AuthScreen } from '../screens/AuthScreen';
import { CabinetScreen } from '../screens/CabinetScreen';
import { HomeStack } from './HomeStack';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkbenchScreen } from '../screens/WorkbenchScreen';
import { colors } from '../theme';

export type RootTabParamList = {
  Home: undefined;
  Workbench: undefined;
  Cabinet: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export function RootNavigator() {
  const { accessToken, hydrated } = useSelector((s: RootState) => s.auth);

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {accessToken ? <MainTabs /> : <AuthScreen />}
    </NavigationContainer>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: 'home-outline',
            Workbench: 'flask-outline',
            Cabinet: 'wine-outline',
            Profile: 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{ title: '首页', headerShown: false }}
      />
      <Tab.Screen
        name="Workbench"
        component={WorkbenchScreen}
        options={{ title: '工作台', headerShown: false }}
      />
      <Tab.Screen
        name="Cabinet"
        component={CabinetScreen}
        options={{ title: '酒柜', headerShown: false }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: '我的', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
