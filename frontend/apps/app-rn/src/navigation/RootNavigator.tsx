import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
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
  return (
    <NavigationContainer theme={navTheme}>
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
          options={{ title: '鸡尾酒助手' }}
        />
        <Tab.Screen
          name="Workbench"
          component={WorkbenchScreen}
          options={{ title: '工作台' }}
        />
        <Tab.Screen name="Cabinet" component={CabinetScreen} options={{ title: '酒柜' }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
