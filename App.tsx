import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {NavProvider} from './src/navController';
import HomeScreen from './screens/HomeScreen';
import NavigateScreen from './screens/NavigateScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function App() {
  return (
    <SafeAreaProvider>
      <NavProvider>
        <NavigationContainer>
          <Tab.Navigator screenOptions={{headerTitleAlign: 'center'}}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Navigate" component={NavigateScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </NavProvider>
    </SafeAreaProvider>
  );
}

export default App;
