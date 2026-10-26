import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { AuthScreen } from '../screens/AuthScreen';
import { CabinetScreen } from '../screens/CabinetScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkbenchScreen } from '../screens/WorkbenchScreen';

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
    background: '#14110F',
    card: '#1C1816',
    text: '#F4EDE4',
    border: '#2A2420',
    primary: '#C9A227',
  },
};

export function RootNavigator() {
  const { accessToken, hydrated } = useSelector((s: RootState) => s.auth);

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#C9A227" size="large" />
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
        headerStyle: { backgroundColor: '#1C1816' },
        headerTintColor: '#F4EDE4',
        tabBarActiveTintColor: '#C9A227',
        tabBarInactiveTintColor: '#8B8178',
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          backgroundColor: '#1C1816',
          borderTopColor: '#2A2420',
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: 'chatbubble-ellipses-outline',
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
        component={HomeScreen}
        options={{ title: '首页', headerShown: false }}
      />
      <Tab.Screen
        name="Workbench"
        component={WorkbenchScreen}
        options={{ title: '调配台', headerShown: false }}
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
    backgroundColor: '#14110F',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
