import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardStack } from './DashboardStack';
import { ExercisesStack } from './ExercisesStack';
import { ProfileStack } from './ProfileStack';

import Ionicons from '@expo/vector-icons/Ionicons';
import { AppStack } from './types';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator<AppStack>();

export function AppTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'DashboardTab') iconName = 'home';
          else if (route.name === 'ExercisesTab') iconName = 'barbell';
          else if (route.name === 'ProfileTab') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="ExercisesTab" component={ExercisesStack} options={{ title: 'Exercises' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
